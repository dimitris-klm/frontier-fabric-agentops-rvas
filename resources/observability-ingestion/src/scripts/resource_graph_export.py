"""Export Azure Resource Graph data to ADLS Gen2 as Parquet files.

Queries Azure Resource Graph for resource metadata including tags,
resource counts by type, and resources by location, then writes the
results as Parquet files to an ADLS Gen2 storage account.
"""

import argparse
import io
import logging
import sys
from datetime import datetime, timezone

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from azure.identity import DefaultAzureCredential
from azure.mgmt.resourcegraph import ResourceGraphClient
from azure.mgmt.resourcegraph.models import (
    QueryRequest,
    QueryRequestOptions,
    ResultFormat,
)
from azure.storage.filedatalake import DataLakeServiceClient

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S%z",
)
logger = logging.getLogger("resource_graph_export")

QUERIES = {
    "all_resources_with_tags": (
        "Resources "
        "| project id, name, type, location, resourceGroup, tags, "
        "subscriptionId, kind, sku, identity "
        "| order by type asc, name asc"
    ),
    "resource_counts_by_type": (
        "Resources "
        "| summarize resourceCount=count() by type "
        "| order by resourceCount desc"
    ),
    "resources_by_location": (
        "Resources "
        "| summarize resourceCount=count() by location, type "
        "| order by location asc, resourceCount desc"
    ),
}


def run_resource_graph_query(
    client: ResourceGraphClient,
    subscription_id: str,
    query: str,
) -> list[dict]:
    """Execute a Resource Graph query and return all rows."""
    all_rows: list[dict] = []
    skip_token = None

    while True:
        options = QueryRequestOptions(
            result_format=ResultFormat.OBJECT_ARRAY,
            skip_token=skip_token,
        )
        request = QueryRequest(
            subscriptions=[subscription_id],
            query=query,
            options=options,
        )
        response = client.resources(request)
        all_rows.extend(response.data)

        skip_token = response.skip_token
        if not skip_token:
            break

    return all_rows


def upload_parquet_to_adls(
    service_client: DataLakeServiceClient,
    container: str,
    directory: str,
    filename: str,
    df: pd.DataFrame,
) -> None:
    """Write a DataFrame as a Parquet file to ADLS Gen2."""
    fs_client = service_client.get_file_system_client(container)
    dir_client = fs_client.get_directory_client(directory)
    dir_client.create_directory()

    table = pa.Table.from_pandas(df, preserve_index=False)
    buffer = io.BytesIO()
    pq.write_table(table, buffer, compression="snappy")
    buffer.seek(0)

    file_client = dir_client.get_file_client(filename)
    file_client.upload_data(buffer.getvalue(), overwrite=True)
    logger.info(
        "Uploaded %s/%s/%s (%d rows)",
        container,
        directory,
        filename,
        len(df),
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export Azure Resource Graph data to ADLS Gen2 as Parquet."
    )
    parser.add_argument(
        "--subscription-id",
        required=True,
        help="Azure subscription ID to query.",
    )
    parser.add_argument(
        "--storage-account",
        required=True,
        help="ADLS Gen2 storage account name.",
    )
    parser.add_argument(
        "--container",
        default="metadata",
        help="Storage container for exports (default: metadata).",
    )
    args = parser.parse_args()

    credential = DefaultAzureCredential()
    graph_client = ResourceGraphClient(credential)

    account_url = f"https://{args.storage_account}.dfs.core.windows.net"
    datalake_client = DataLakeServiceClient(
        account_url=account_url,
        credential=credential,
    )

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")
    date_partition = datetime.now(timezone.utc).strftime(
        "year=%Y/month=%m/day=%d"
    )
    failed_queries: list[str] = []

    for query_name, query_text in QUERIES.items():
        logger.info("Running query: %s", query_name)
        try:
            rows = run_resource_graph_query(
                graph_client,
                args.subscription_id,
                query_text,
            )
        except Exception:
            logger.exception("Failed to execute query '%s'", query_name)
            failed_queries.append(query_name)
            continue

        if not rows:
            logger.warning("Query '%s' returned no results", query_name)
            continue

        df = pd.json_normalize(rows)
        directory = f"resource-graph/{date_partition}/{query_name}"
        filename = f"{query_name}_{timestamp}.parquet"

        try:
            upload_parquet_to_adls(
                datalake_client,
                args.container,
                directory,
                filename,
                df,
            )
        except Exception:
            logger.exception(
                "Failed to upload results for query '%s'", query_name
            )
            failed_queries.append(query_name)

    if failed_queries:
        raise RuntimeError(
            "Resource Graph export failed for: " + ", ".join(failed_queries)
        )

    logger.info("Resource Graph export completed.")


if __name__ == "__main__":
    sys.exit(main() or 0)
