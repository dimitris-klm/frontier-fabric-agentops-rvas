"""Deploy the Observability Analytics report to a Fabric workspace.

Resolves the workspace and semantic model by *name* and rewrites the PBIR dataset
reference before upload, so the report definition in source control carries no
environment-specific GUID.
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

FABRIC_API_BASE = "https://api.fabric.microsoft.com/v1"
FABRIC_SCOPE = "https://api.fabric.microsoft.com/.default"

REPO_ROOT = pathlib.Path(__file__).resolve().parents[4]
REPORT_DIR = REPO_ROOT / "powerbi" / "Observability Analytics Report.Report"
PBIR_PATH = "definition.pbir"

console = Console()


class FabricClient:
    """Thin wrapper around the Fabric REST API with the helpers this script needs."""

    def __init__(self, credential: DefaultAzureCredential) -> None:
        self._credential = credential

    @property
    def _headers(self) -> dict[str, str]:
        token = self._credential.get_token(FABRIC_SCOPE)
        return {
            "Authorization": f"Bearer {token.token}",
            "Content-Type": "application/json",
        }

    def _get(self, path: str, **kwargs: Any) -> requests.Response:
        resp = requests.get(f"{FABRIC_API_BASE}{path}", headers=self._headers, timeout=60, **kwargs)
        resp.raise_for_status()
        return resp

    def _post(self, path: str, payload: dict[str, Any] | None = None) -> requests.Response:
        resp = requests.post(f"{FABRIC_API_BASE}{path}", headers=self._headers, json=payload, timeout=180)
        resp.raise_for_status()
        return resp

    def _list(self, path: str, key: str = "value") -> list[dict[str, Any]]:
        """Follow continuation tokens so large workspaces resolve correctly."""
        items: list[dict[str, Any]] = []
        next_path: str | None = path
        while next_path:
            body = self._get(next_path).json()
            items.extend(body.get(key, []))
            token = body.get("continuationToken")
            joiner = "&" if "?" in path else "?"
            next_path = f"{path}{joiner}continuationToken={token}" if token else None
        return items

    def _wait_for_operation(self, response: requests.Response, timeout_seconds: int = 900) -> None:
        if response.status_code != 202:
            return
        operation_id = response.headers.get("x-ms-operation-id")
        if not operation_id:
            raise RuntimeError("Fabric returned 202 Accepted without an x-ms-operation-id header.")

        deadline = time.monotonic() + timeout_seconds
        retry_after = int(response.headers.get("Retry-After", "5"))
        while time.monotonic() < deadline:
            time.sleep(retry_after)
            operation_response = self._get(f"/operations/{operation_id}")
            operation = operation_response.json()
            status = operation.get("status")
            if status == "Succeeded":
                return
            if status == "Failed":
                raise RuntimeError(f"Fabric operation {operation_id} failed: {operation.get('error')}")
            retry_after = int(operation_response.headers.get("Retry-After", "5"))

        raise TimeoutError(f"Fabric operation {operation_id} did not complete in {timeout_seconds}s.")

    # ------------------------------------------------------------------
    # Name resolution
    # ------------------------------------------------------------------

    def resolve_workspace(self, name: str) -> str:
        for workspace in self._list("/workspaces"):
            if workspace.get("displayName") == name:
                return workspace["id"]
        raise click.ClickException(f"Workspace '{name}' not found, or you lack access to it.")

    def resolve_semantic_model(self, workspace_id: str, name: str) -> str:
        models = self._list(f"/workspaces/{workspace_id}/semanticModels")
        for model in models:
            if model.get("displayName") == name:
                return model["id"]
        available = ", ".join(sorted(m.get("displayName", "?") for m in models)) or "none"
        raise click.ClickException(
            f"Semantic model '{name}' not found in the workspace. Available models: {available}."
        )

    def find_report(self, workspace_id: str, name: str) -> str | None:
        for report in self._list(f"/workspaces/{workspace_id}/reports"):
            if report.get("displayName") == name:
                return report["id"]
        return None

    # ------------------------------------------------------------------
    # Report create / update
    # ------------------------------------------------------------------

    def create_report(self, workspace_id: str, name: str, description: str, parts: list[dict[str, str]]) -> None:
        response = self._post(
            f"/workspaces/{workspace_id}/reports",
            {"displayName": name, "description": description, "definition": {"parts": parts}},
        )
        self._wait_for_operation(response)

    def update_report(self, workspace_id: str, report_id: str, parts: list[dict[str, str]]) -> None:
        response = self._post(
            f"/workspaces/{workspace_id}/reports/{report_id}/updateDefinition?updateMetadata=True",
            {"definition": {"parts": parts}},
        )
        self._wait_for_operation(response)


def build_parts(report_dir: pathlib.Path, model_id: str) -> list[dict[str, str]]:
    """Base64-encode every file, substituting the resolved model id into the PBIR."""
    if not report_dir.is_dir():
        raise click.ClickException(f"Report definition not found at {report_dir}. Run 'npm run build:report' first.")

    parts: list[dict[str, str]] = []
    for file_path in sorted(report_dir.rglob("*")):
        if not file_path.is_file():
            continue
        relative = file_path.relative_to(report_dir).as_posix()

        if relative == PBIR_PATH:
            pbir = json.loads(file_path.read_text(encoding="utf-8"))
            connection = pbir.get("datasetReference", {}).get("byConnection")
            if not connection:
                raise click.ClickException(
                    "definition.pbir has no datasetReference.byConnection block to bind."
                )
            connection["pbiModelDatabaseName"] = model_id
            payload = json.dumps(pbir, indent=2).encode("utf-8")
        else:
            payload = file_path.read_bytes()

        parts.append(
            {
                "path": relative,
                "payload": base64.b64encode(payload).decode("ascii"),
                "payloadType": "InlineBase64",
            }
        )

    if not any(part["path"] == PBIR_PATH for part in parts):
        raise click.ClickException(f"{PBIR_PATH} is missing from {report_dir}.")
    return parts


@click.command()
@click.option("--workspace-name", required=True, help="Fabric workspace holding the semantic model.")
@click.option("--semantic-model-name", default="Observability Analytics", show_default=True,
              help="Semantic model the report binds to.")
@click.option("--report-name", default="Observability Analytics Report", show_default=True,
              help="Display name for the report item.")
@click.option("--report-dir", type=click.Path(path_type=pathlib.Path), default=REPORT_DIR, show_default=False,
              help="PBIR folder to upload. Defaults to powerbi/Observability Analytics Report.Report.")
def main(workspace_name: str, semantic_model_name: str, report_name: str, report_dir: pathlib.Path) -> None:
    """Create or update the report, binding it to the named semantic model."""
    client = FabricClient(DefaultAzureCredential())

    workspace_id = client.resolve_workspace(workspace_name)
    console.print(f"Workspace [bold]{workspace_name}[/bold] -> {workspace_id}")

    model_id = client.resolve_semantic_model(workspace_id, semantic_model_name)
    console.print(f"Semantic model [bold]{semantic_model_name}[/bold] -> {model_id}")

    parts = build_parts(report_dir, model_id)
    console.print(f"Prepared {len(parts)} definition parts from {report_dir}")

    report_id = client.find_report(workspace_id, report_name)
    if report_id:
        client.update_report(workspace_id, report_id, parts)
        console.print(f"[green]Updated[/green] report '{report_name}' ({report_id})")
    else:
        client.create_report(
            workspace_id,
            report_name,
            "Reliability, cost, and agent performance control tower for the Observability Analytics model.",
            parts,
        )
        console.print(f"[green]Created[/green] report '{report_name}'")


if __name__ == "__main__":
    try:
        main()
    except requests.HTTPError as exc:
        detail = exc.response.text if exc.response is not None else str(exc)
        console.print(f"[red]Fabric API error:[/red] {detail}")
        sys.exit(1)
