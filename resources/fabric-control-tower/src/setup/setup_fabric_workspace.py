"""Setup script for provisioning a Microsoft Fabric workspace with Lakehouse,
ADLS Gen2 shortcuts, notebooks, and pipelines via the Fabric REST API.

Usage:
    python setup_fabric_workspace.py \
        --storage-account-url https://<account>.dfs.core.windows.net \
        --connection-id <fabric-connection-id> \
        --capacity-id <fabric-capacity-id>
"""

from __future__ import annotations

import base64
import json
import pathlib
import sys
import time
from typing import Any

import click
import requests
from azure.identity import DefaultAzureCredential
from rich.console import Console
from rich.table import Table

FABRIC_API_BASE = "https://api.fabric.microsoft.com/v1"
FABRIC_SCOPE = "https://api.fabric.microsoft.com/.default"

SHORTCUT_CONTAINERS = ["costs", "metrics", "logs", "metadata"]

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
NOTEBOOKS_DIR = REPO_ROOT / "fabric" / "notebooks"
PIPELINES_DIR = REPO_ROOT / "fabric" / "pipelines"

console = Console()


class FabricClient:
    """Thin wrapper around the Fabric REST API with idempotent helpers."""

    def __init__(self, credential: DefaultAzureCredential) -> None:
        self._credential = credential
        self._token: str | None = None

    # ------------------------------------------------------------------
    # Authentication
    # ------------------------------------------------------------------

    def _get_access_token(self) -> str:
        """Acquire (or refresh) an access token for the Fabric API."""
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

    def _get(self, path: str, **kwargs: Any) -> requests.Response:
        url = f"{FABRIC_API_BASE}{path}"
        resp = requests.get(url, headers=self._headers, timeout=60, **kwargs)
        resp.raise_for_status()
        return resp

    def _post(self, path: str, payload: dict[str, Any] | None = None, **kwargs: Any) -> requests.Response:
        url = f"{FABRIC_API_BASE}{path}"
        resp = requests.post(url, headers=self._headers, json=payload, timeout=120, **kwargs)
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
    # Idempotent item helpers
    # ------------------------------------------------------------------

    def _list_items(self, workspace_id: str, item_type: str | None = None) -> list[dict[str, Any]]:
        """Return all items in a workspace, optionally filtered by type."""
        items: list[dict[str, Any]] = []
        path = f"/workspaces/{workspace_id}/items"
        if item_type:
            path += f"?type={item_type}"

        while path:
            resp = self._get(path)
            body = resp.json()
            items.extend(body.get("value", []))
            continuation = body.get("continuationUri")
            if continuation:
                # continuationUri is an absolute URL; strip the base so _get works
                path = continuation.replace(FABRIC_API_BASE, "")
            else:
                path = ""
        return items

    def _find_item(self, workspace_id: str, display_name: str, item_type: str) -> dict[str, Any] | None:
        """Find an existing item by display name and type."""
        items = self._list_items(workspace_id, item_type=item_type)
        for item in items:
            if item.get("displayName") == display_name:
                return item
        return None

    def create_or_get_item(
        self,
        workspace_id: str,
        display_name: str,
        item_type: str,
        definition: dict[str, Any] | None = None,
        description: str | None = None,
    ) -> dict[str, Any]:
        """Create a workspace item if it does not already exist, otherwise return existing."""
        existing = self._find_item(workspace_id, display_name, item_type)
        if existing:
            console.print(f"  [yellow]⏭  {item_type} '{display_name}' already exists — skipping.[/yellow]")
            return existing

        payload: dict[str, Any] = {
            "displayName": display_name,
            "type": item_type,
        }
        if description:
            payload["description"] = description
        if definition:
            payload["definition"] = definition

        resp = self._post(f"/workspaces/{workspace_id}/items", payload)
        if resp.status_code == 202:
            console.print(f"  [cyan]⏳ {item_type} '{display_name}' creation accepted (async).[/cyan]")
            item = self._wait_for_operation(resp)
            console.print(f"  [green]✔  Created {item_type} '{display_name}'.[/green]")
            return item

        item = resp.json()
        console.print(f"  [green]✔  Created {item_type} '{display_name}'.[/green]")
        return item

    # ------------------------------------------------------------------
    # Workspace
    # ------------------------------------------------------------------

    def create_or_get_workspace(self, display_name: str, capacity_id: str) -> dict[str, Any]:
        """Create a workspace or return the existing one, then assign capacity."""
        # List workspaces the caller has access to and check for a match.
        resp = self._get("/workspaces")
        workspaces = resp.json().get("value", [])
        for ws in workspaces:
            if ws.get("displayName") == display_name:
                console.print(f"[yellow]⏭  Workspace '{display_name}' already exists.[/yellow]")
                return ws

        payload = {
            "displayName": display_name,
            "capacityId": capacity_id,
        }
        resp = self._post("/workspaces", payload)
        workspace = resp.json()
        console.print(f"[green]✔  Created workspace '{display_name}'.[/green]")
        return workspace

    # ------------------------------------------------------------------
    # Lakehouse
    # ------------------------------------------------------------------

    def create_or_get_lakehouse(self, workspace_id: str, display_name: str = "Observability") -> dict[str, Any]:
        """Create a Lakehouse item in the workspace."""
        return self.create_or_get_item(workspace_id, display_name, "Lakehouse")

    # ------------------------------------------------------------------
    # Shortcuts
    # ------------------------------------------------------------------

    def create_shortcut(
        self,
        workspace_id: str,
        lakehouse_id: str,
        shortcut_name: str,
        storage_account_url: str,
        connection_id: str,
        container_name: str,
        sub_path: str = "/",
    ) -> None:
        """Create an ADLS Gen2 shortcut in the Lakehouse Files section."""
        path = f"/workspaces/{workspace_id}/items/{lakehouse_id}/shortcuts"

        # Check for existing shortcut (the shortcuts API returns a list).
        try:
            resp = self._get(path)
            existing = resp.json().get("value", [])
            for sc in existing:
                if sc.get("name") == shortcut_name:
                    console.print(f"  [yellow]⏭  Shortcut '{shortcut_name}' already exists — skipping.[/yellow]")
                    return
        except requests.HTTPError:
            # 404 means no shortcuts yet — safe to proceed.
            pass

        payload = {
            "path": "Files",
            "name": shortcut_name,
            "target": {
                "adlsGen2": {
                    "location": storage_account_url,
                    "subpath": sub_path,
                    "connectionId": connection_id,
                },
            },
        }

        try:
            self._post(path, payload)
            console.print(f"  [green]✔  Created shortcut '{shortcut_name}' → {container_name}.[/green]")
        except requests.HTTPError as exc:
            console.print(f"  [red]✖  Failed to create shortcut '{shortcut_name}': {exc}[/red]")
            raise

    # ------------------------------------------------------------------
    # Notebooks
    # ------------------------------------------------------------------

    def import_notebooks(self, workspace_id: str, notebooks_dir: pathlib.Path) -> list[dict[str, Any]]:
        """Import all .ipynb notebooks from a directory."""
        results: list[dict[str, Any]] = []
        if not notebooks_dir.is_dir():
            console.print(f"[yellow]⚠  Notebooks directory not found: {notebooks_dir}[/yellow]")
            return results

        notebook_files = sorted(notebooks_dir.glob("*.ipynb"))
        if not notebook_files:
            console.print("[yellow]⚠  No .ipynb files found.[/yellow]")
            return results

        for nb_path in notebook_files:
            display_name = nb_path.stem
            raw_content = nb_path.read_bytes()
            encoded = base64.b64encode(raw_content).decode("utf-8")

            definition = {
                "format": "ipynb",
                "parts": [
                    {
                        "path": "artifact.content.ipynb",
                        "payload": encoded,
                        "payloadType": "InlineBase64",
                    }
                ],
            }

            item = self.create_or_get_item(
                workspace_id,
                display_name,
                "Notebook",
                definition=definition,
                description=f"Imported from {nb_path.name}",
            )
            results.append(item)

        return results

    # ------------------------------------------------------------------
    # Pipelines
    # ------------------------------------------------------------------

    def import_pipelines(self, workspace_id: str, pipelines_dir: pathlib.Path) -> list[dict[str, Any]]:
        """Import all pipeline JSON definitions from a directory."""
        results: list[dict[str, Any]] = []
        if not pipelines_dir.is_dir():
            console.print(f"[yellow]⚠  Pipelines directory not found: {pipelines_dir}[/yellow]")
            return results

        pipeline_files = list(pipelines_dir.glob("*.json"))
        if not pipeline_files:
            console.print("[yellow]⚠  No pipeline .json files found.[/yellow]")
            return results

        pipeline_definitions: list[tuple[pathlib.Path, dict[str, Any]]] = []
        for pipeline_path in pipeline_files:
            pipeline_content = json.loads(pipeline_path.read_text(encoding="utf-8"))
            pipeline_definitions.append((pipeline_path, pipeline_content))

        pipeline_definitions.sort(
            key=lambda entry: any(
                activity.get("type") == "ExecutePipeline"
                for activity in entry[1].get("properties", {}).get("activities", [])
            )
        )

        notebooks = self._list_items(workspace_id, item_type="Notebook")
        notebooks_by_reference = {
            reference: notebook
            for notebook in notebooks
            for reference in (notebook.get("displayName"), notebook.get("id"))
            if reference
        }
        pipelines_by_reference = {
            reference: pipeline
            for pipeline in self._list_items(workspace_id, item_type="DataPipeline")
            for reference in (pipeline.get("displayName"), pipeline.get("id"))
            if reference
        }

        for pl_path, pipeline_content in pipeline_definitions:
            display_name = pipeline_content.get("name", pl_path.stem)

            for activity in pipeline_content.get("properties", {}).get("activities", []):
                type_properties = activity.setdefault("typeProperties", {})
                if activity.get("type") == "TridentNotebook":
                    notebook_reference = type_properties.get("notebookId")
                    notebook = notebooks_by_reference.get(notebook_reference)
                    if not notebook:
                        raise RuntimeError(
                            f"Pipeline '{display_name}' references notebook '{notebook_reference}', "
                            "but that notebook does not exist in the workspace."
                        )

                    type_properties["notebookId"] = notebook["id"]
                    type_properties["workspaceId"] = workspace_id

                if activity.get("type") == "ExecutePipeline":
                    pipeline_reference = type_properties.get("pipeline", {}).get("referenceName")
                    referenced_pipeline = pipelines_by_reference.get(pipeline_reference)
                    if not referenced_pipeline:
                        raise RuntimeError(
                            f"Pipeline '{display_name}' references pipeline '{pipeline_reference}', "
                            "but that pipeline does not exist in the workspace."
                        )

                    type_properties["pipeline"]["referenceName"] = referenced_pipeline["id"]
                    type_properties["workspaceId"] = workspace_id

            raw_content = json.dumps(pipeline_content).encode("utf-8")
            encoded = base64.b64encode(raw_content).decode("utf-8")

            definition = {
                "parts": [
                    {
                        "path": "pipeline-content.json",
                        "payload": encoded,
                        "payloadType": "InlineBase64",
                    }
                ],
            }

            item = self.create_or_get_item(
                workspace_id,
                display_name,
                "DataPipeline",
                definition=definition,
                description=f"Imported from {pl_path.name}",
            )
            results.append(item)
            for reference in (item.get("displayName"), item.get("id")):
                if reference:
                    pipelines_by_reference[reference] = item

        return results


def _print_summary(workspace: dict[str, Any], lakehouse: dict[str, Any], notebooks: list, pipelines: list) -> None:
    """Print a summary table of provisioned resources."""
    table = Table(title="Provisioned Resources", show_lines=True)
    table.add_column("Resource", style="bold")
    table.add_column("Name")
    table.add_column("ID", style="dim")

    table.add_row("Workspace", workspace.get("displayName", "—"), workspace.get("id", "—"))
    table.add_row("Lakehouse", lakehouse.get("displayName", "—"), lakehouse.get("id", "—"))

    for nb in notebooks:
        table.add_row("Notebook", nb.get("displayName", "—"), nb.get("id", "—"))
    for pl in pipelines:
        table.add_row("Pipeline", pl.get("displayName", "—"), pl.get("id", "—"))

    console.print()
    console.print(table)


@click.command()
@click.option(
    "--workspace-name",
    default="Observability-Analytics",
    show_default=True,
    help="Display name for the Fabric workspace.",
)
@click.option(
    "--storage-account-url",
    required=True,
    help="ADLS Gen2 storage account URL (e.g. https://<account>.dfs.core.windows.net).",
)
@click.option(
    "--connection-id",
    required=True,
    help="Fabric cloud connection ID for the ADLS Gen2 storage account.",
)
@click.option(
    "--capacity-id",
    required=True,
    help="Fabric capacity ID to assign the workspace to.",
)
def main(workspace_name: str, storage_account_url: str, connection_id: str, capacity_id: str) -> None:
    """Provision a Microsoft Fabric workspace for observability analytics.

    Creates a workspace, Lakehouse, ADLS Gen2 shortcuts, and imports
    notebooks and pipelines from the repository.
    """
    console.rule("[bold blue]Fabric Workspace Setup[/bold blue]")

    try:
        credential = DefaultAzureCredential()
        client = FabricClient(credential)

        # 1. Workspace --------------------------------------------------
        with console.status("Creating workspace…"):
            workspace = client.create_or_get_workspace(workspace_name, capacity_id)
        workspace_id = workspace["id"]

        # 2. Lakehouse ---------------------------------------------------
        with console.status("Creating Lakehouse…"):
            lakehouse = client.create_or_get_lakehouse(workspace_id)
        lakehouse_id = lakehouse.get("id", "")

        # 3. ADLS Gen2 shortcuts -----------------------------------------
        if lakehouse_id:
            with console.status("Creating ADLS Gen2 shortcuts…"):
                for container in SHORTCUT_CONTAINERS:
                    client.create_shortcut(
                        workspace_id=workspace_id,
                        lakehouse_id=lakehouse_id,
                        shortcut_name=container,
                        storage_account_url=storage_account_url,
                        connection_id=connection_id,
                        container_name=container,
                        sub_path=f"/{container}",
                    )
        else:
            console.print("[yellow]⚠  Lakehouse ID unavailable — skipping shortcuts.[/yellow]")

        # 4. Notebooks ---------------------------------------------------
        with console.status("Importing notebooks…"):
            notebooks = client.import_notebooks(workspace_id, NOTEBOOKS_DIR)

        # 5. Pipelines ---------------------------------------------------
        with console.status("Importing pipelines…"):
            pipelines = client.import_pipelines(workspace_id, PIPELINES_DIR)

        # Summary --------------------------------------------------------
        _print_summary(workspace, lakehouse, notebooks, pipelines)
        console.print("\n[bold green]✔ Workspace setup complete.[/bold green]")

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
