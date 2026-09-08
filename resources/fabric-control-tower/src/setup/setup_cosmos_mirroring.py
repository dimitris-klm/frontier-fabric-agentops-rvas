"""Setup script for configuring Cosmos DB mirroring into a Microsoft Fabric
workspace via the Fabric REST API.

Mirrors the *conversations* and *interactions* containers from a Cosmos DB
database into a Fabric MirroredDatabase item so the data is queryable via
Spark and SQL analytics endpoints.

Usage:
    python setup_cosmos_mirroring.py \
        --workspace-id <workspace-guid> \
        --cosmos-account <account-name> \
        --database observability
"""

from __future__ import annotations

import base64
import json
import sys
import time
from typing import Any
from urllib.parse import urlparse

import click
import requests
from azure.identity import DefaultAzureCredential
from rich.console import Console
from rich.table import Table

FABRIC_API_BASE = "https://api.fabric.microsoft.com/v1"
FABRIC_SCOPE = "https://api.fabric.microsoft.com/.default"

CONTAINERS_TO_MIRROR = ["conversations", "interactions"]

console = Console()


class FabricMirroringClient:
    """Client for the Fabric Mirroring REST API."""

    def __init__(self, credential: DefaultAzureCredential) -> None:
        self._credential = credential
        self._token: str | None = None

    # ------------------------------------------------------------------
    # Authentication
    # ------------------------------------------------------------------

    def _get_access_token(self) -> str:
        """Acquire an access token for the Fabric API."""
        token = self._credential.get_token(FABRIC_SCOPE)
        self._token = token.token
        return self._token

    @property
    def _headers(self) -> dict[str, str]:
        token = self._get_access_token()
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    # ------------------------------------------------------------------
    # Low-level HTTP helpers
    # ------------------------------------------------------------------

    def _get(self, path: str) -> requests.Response:
        url = f"{FABRIC_API_BASE}{path}"
        resp = requests.get(url, headers=self._headers, timeout=60)
        resp.raise_for_status()
        return resp

    def _post(self, path: str, payload: dict[str, Any] | None = None) -> requests.Response:
        url = f"{FABRIC_API_BASE}{path}"
        resp = requests.post(url, headers=self._headers, json=payload, timeout=120)
        resp.raise_for_status()
        return resp

    def _wait_for_operation(self, response: requests.Response, timeout_seconds: int = 1200) -> dict[str, Any]:
        """Wait for a Fabric long-running operation and return its result."""
        operation_id = response.headers.get("x-ms-operation-id")
        if not operation_id:
            raise RuntimeError("Fabric returned 202 Accepted without an x-ms-operation-id header.")

        operation_path = f"/operations/{operation_id}"
        deadline = time.monotonic() + timeout_seconds
        retry_after = int(response.headers.get("Retry-After", "5"))

        while time.monotonic() < deadline:
            time.sleep(retry_after)
            operation_response = self._get(operation_path)
            operation = operation_response.json()
            status = operation.get("status")

            if status == "Succeeded":
                return self._get(f"{operation_path}/result").json()
            if status == "Failed":
                raise RuntimeError(f"Fabric operation {operation_id} failed: {operation.get('error')}")

            retry_after = int(operation_response.headers.get("Retry-After", "5"))

        raise TimeoutError(f"Fabric operation {operation_id} did not complete within {timeout_seconds} seconds.")

    # ------------------------------------------------------------------
    # Idempotent helpers
    # ------------------------------------------------------------------

    def _find_mirrored_database(self, workspace_id: str, display_name: str) -> dict[str, Any] | None:
        """Find an existing MirroredDatabase item in the workspace by name."""
        path = f"/workspaces/{workspace_id}/mirroredDatabases"
        try:
            resp = self._get(path)
            items = resp.json().get("value", [])
            for item in items:
                if item.get("displayName") == display_name:
                    return item
        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code == 404:
                return None
            raise
        return None

    def resolve_cosmos_connection_id(self, cosmos_endpoint: str, connection_id: str | None = None) -> str:
        """Return an explicit connection ID or find the Cosmos connection for an endpoint."""
        if connection_id:
            return connection_id

        endpoint_host = (urlparse(cosmos_endpoint).hostname or "").casefold()
        matches: list[dict[str, Any]] = []
        path = "/connections"

        while path:
            response = self._get(path)
            body = response.json()
            for connection in body.get("value", []):
                details = connection.get("connectionDetails", {})
                connection_type = str(details.get("type", "")).casefold()
                connection_path = str(details.get("path", "")).casefold()
                if connection_type in {"cosmosdb", "azurecosmosdb", "azurecosmosdbv2"} and endpoint_host in connection_path:
                    matches.append(connection)

            continuation_uri = body.get("continuationUri")
            path = continuation_uri.replace(FABRIC_API_BASE, "") if continuation_uri else ""

        if len(matches) == 1:
            resolved_id = matches[0].get("id")
            if resolved_id:
                console.print(
                    f"[green]✔  Using Cosmos DB connection '{matches[0].get('displayName', resolved_id)}'.[/green]"
                )
                return resolved_id

        if len(matches) > 1:
            raise RuntimeError(
                f"Multiple Fabric Cosmos DB connections match {cosmos_endpoint}. "
                "Pass the intended connection GUID with --connection-id."
            )

        raise RuntimeError(
            f"No Fabric Cosmos DB connection matches {cosmos_endpoint}. Create an Azure Cosmos DB v2 "
            "cloud connection with Organizational account authentication, then pass its GUID with --connection-id."
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def create_or_get_mirrored_database(
        self,
        workspace_id: str,
        display_name: str,
        connection_id: str,
        database: str,
    ) -> dict[str, Any]:
        """Create a MirroredDatabase item for Cosmos DB, or return the existing one.

        Args:
            workspace_id: Target Fabric workspace ID.
            display_name: Display name for the mirrored database item.
            connection_id: Fabric Cosmos DB connection ID.
            database: Source Cosmos DB database name.

        Returns:
            The mirrored database item dict.
        """
        existing = self._find_mirrored_database(workspace_id, display_name)
        if existing:
            console.print(f"[yellow]⏭  MirroredDatabase '{display_name}' already exists — skipping creation.[/yellow]")
            return existing

        mirroring_definition = {
            "properties": {
                "source": {
                    "type": "CosmosDb",
                    "typeProperties": {
                        "connection": connection_id,
                        "database": database,
                    },
                },
                "target": {
                    "type": "MountedRelationalDatabase",
                    "typeProperties": {
                        "defaultSchema": "dbo",
                        "format": "Delta",
                    },
                },
            },
        }

        platform_definition = {
            "$schema": "https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json",
            "metadata": {
                "type": "MirroredDatabase",
                "displayName": display_name,
            },
            "config": {
                "version": "2.0",
                "logicalId": "00000000-0000-0000-0000-000000000000",
            },
        }

        def encode_part(value: dict[str, Any]) -> str:
            content = json.dumps(value, separators=(",", ":")).encode("utf-8")
            return base64.b64encode(content).decode("ascii")

        payload: dict[str, Any] = {
            "displayName": display_name,
            "description": f"Azure Cosmos DB mirror for {database}",
            "definition": {
                "parts": [
                    {
                        "path": "mirroring.json",
                        "payload": encode_part(mirroring_definition),
                        "payloadType": "InlineBase64",
                    },
                    {
                        "path": ".platform",
                        "payload": encode_part(platform_definition),
                        "payloadType": "InlineBase64",
                    },
                ],
            },
        }

        resp = self._post(f"/workspaces/{workspace_id}/mirroredDatabases", payload)

        if resp.status_code == 202:
            console.print(f"[cyan]⏳ MirroredDatabase '{display_name}' creation accepted (async).[/cyan]")
            return self._wait_for_operation(resp)

        item = resp.json()
        console.print(f"[green]✔  Created MirroredDatabase '{display_name}'.[/green]")
        return item

    def start_mirroring(
        self,
        workspace_id: str,
        mirrored_db_id: str,
        timeout: int = 180,
        poll_interval: int = 10,
    ) -> None:
        """Start (or confirm) the mirroring process.

        Args:
            workspace_id: Fabric workspace ID.
            mirrored_db_id: ID of the MirroredDatabase item.
        """
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            state = self.get_mirroring_status(workspace_id, mirrored_db_id).get("status", "").lower()
            if state in ("running", "healthy", "active"):
                console.print("[yellow]⏭  Mirroring is already running.[/yellow]")
                return
            if state != "initializing":
                break
            console.print("[dim]   Mirroring status: initializing — waiting to start…[/dim]")
            time.sleep(poll_interval)
        else:
            raise TimeoutError("Mirroring did not leave the initializing state before the start timeout.")

        path = f"/workspaces/{workspace_id}/mirroredDatabases/{mirrored_db_id}/startMirroring"

        try:
            self._post(path)
            console.print("[green]✔  Mirroring started.[/green]")
        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code == 409:
                console.print("[yellow]⏭  Mirroring is already running.[/yellow]")
            else:
                console.print(f"[red]✖  Failed to start mirroring: {exc}[/red]")
                raise

    def get_mirroring_status(self, workspace_id: str, mirrored_db_id: str) -> dict[str, Any]:
        """Return the current mirroring status.

        Args:
            workspace_id: Fabric workspace ID.
            mirrored_db_id: ID of the MirroredDatabase item.

        Returns:
            Status response dict from the Fabric API.
        """
        path = f"/workspaces/{workspace_id}/mirroredDatabases/{mirrored_db_id}/getMirroringStatus"
        resp = self._post(path)
        return resp.json()


def _wait_for_mirroring_healthy(
    client: FabricMirroringClient,
    workspace_id: str,
    mirrored_db_id: str,
    timeout: int = 120,
    poll_interval: int = 10,
) -> bool:
    """Poll mirroring status until it becomes healthy or timeout is reached.

    Args:
        client: Fabric mirroring client.
        workspace_id: Fabric workspace ID.
        mirrored_db_id: MirroredDatabase item ID.
        timeout: Maximum seconds to wait.
        poll_interval: Seconds between polls.

    Returns:
        True if mirroring reached a healthy state, False on timeout.
    """
    start = time.monotonic()
    while time.monotonic() - start < timeout:
        try:
            status = client.get_mirroring_status(workspace_id, mirrored_db_id)
            state = status.get("status", "").lower()
            if state in ("running", "healthy", "active"):
                console.print(f"[green]✔  Mirroring status: {state}.[/green]")
                return True
            console.print(f"[dim]   Mirroring status: {state} — waiting…[/dim]")
        except requests.HTTPError:
            console.print("[dim]   Status endpoint not ready — waiting…[/dim]")
        time.sleep(poll_interval)
    console.print("[yellow]⚠  Timed out waiting for mirroring to become healthy.[/yellow]")
    return False


def _print_summary(mirrored_db: dict[str, Any], containers: list[str]) -> None:
    """Print a summary table."""
    table = Table(title="Cosmos DB Mirroring Summary", show_lines=True)
    table.add_column("Property", style="bold")
    table.add_column("Value")

    table.add_row("Mirrored Database", mirrored_db.get("displayName", "—"))
    table.add_row("Item ID", mirrored_db.get("id", "—"))
    table.add_row("Mirrored Containers", ", ".join(containers))

    console.print()
    console.print(table)


@click.command()
@click.option(
    "--workspace-id",
    required=True,
    help="Fabric workspace ID (GUID).",
)
@click.option(
    "--cosmos-account",
    required=True,
    help="Cosmos DB account name (without .documents.azure.com).",
)
@click.option(
    "--database",
    required=True,
    default="observability",
    show_default=True,
    help="Cosmos DB database name to mirror.",
)
@click.option(
    "--connection-id",
    help="Fabric Azure Cosmos DB v2 cloud connection ID. Auto-resolved by endpoint when omitted.",
)
def main(workspace_id: str, cosmos_account: str, database: str, connection_id: str | None) -> None:
    """Configure Cosmos DB mirroring into a Fabric workspace.

    Creates a MirroredDatabase item, configures mirroring for the
    'conversations' and 'interactions' containers, and starts the
    mirroring process.
    """
    console.rule("[bold blue]Cosmos DB Mirroring Setup[/bold blue]")

    display_name = f"CosmosDB-{database}"

    try:
        credential = DefaultAzureCredential()
        client = FabricMirroringClient(credential)
        cosmos_endpoint = f"https://{cosmos_account}.documents.azure.com:443/"

        with console.status("Resolving Cosmos DB connection…"):
            resolved_connection_id = client.resolve_cosmos_connection_id(cosmos_endpoint, connection_id)

        # 1. Create or retrieve the MirroredDatabase item ----------------
        with console.status("Creating MirroredDatabase item…"):
            mirrored_db = client.create_or_get_mirrored_database(
                workspace_id=workspace_id,
                display_name=display_name,
                connection_id=resolved_connection_id,
                database=database,
            )

        mirrored_db_id = mirrored_db.get("id")

        if not mirrored_db_id:
            console.print("[yellow]⚠  MirroredDatabase ID unavailable (async creation). "
                          "Re-run after the item is provisioned.[/yellow]")
            sys.exit(0)

        # 2. Start mirroring ---------------------------------------------
        with console.status("Starting mirroring…"):
            client.start_mirroring(workspace_id, mirrored_db_id)

        # 3. Wait for healthy status -------------------------------------
        with console.status("Waiting for mirroring to become healthy…"):
            _wait_for_mirroring_healthy(client, workspace_id, mirrored_db_id)

        # Summary --------------------------------------------------------
        _print_summary(mirrored_db, CONTAINERS_TO_MIRROR)
        console.print("\n[bold green]✔ Cosmos DB mirroring setup complete.[/bold green]")

    except requests.HTTPError as exc:
        console.print(f"\n[bold red]✖ Fabric API error:[/bold red] {exc}")
        if exc.response is not None:
            console.print(exc.response.text)
        sys.exit(1)
    except Exception as exc:
        console.print(f"\n[bold red]✖ Unexpected error:[/bold red] {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
