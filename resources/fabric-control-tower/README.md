# Fabric Control Tower — Reference Component

> **Part of the [Frontier Fabric AgentOps RVAS](../../README.md).** This is the **control
> tower** itself — the Fabric workspace you stand up across
> **[Challenge 3](../../challenges/challenge-03-onelake-foundation.md)** (OneLake foundation),
> **[Challenge 4](../../challenges/challenge-04-medallion-pipeline.md)** (medallion pipeline), and
> **[Challenge 5](../../challenges/challenge-05-control-tower-dashboards.md)** (Direct Lake dashboards).

## Overview

This component implements the Microsoft Fabric analytics layer of the AgentOps Control Tower. It processes data from Azure Monitor, Cost Management, and Cosmos DB through a **medallion architecture** (Bronze → Silver → Gold) in Microsoft Fabric, producing Power BI reports for operational insights.

Raw telemetry — cost exports, platform metrics, diagnostic logs, and AI-agent conversations — flows into a Fabric Lakehouse via ADLS Gen2 shortcuts and Cosmos DB Mirroring. PySpark notebooks transform the data through progressively refined layers, and a Direct Lake semantic model powers interactive Power BI dashboards without any data duplication.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Data Sources                                      │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │  ADLS Gen2        │  │  ADLS Gen2        │  │  Cosmos DB               │  │
│  │  Cost Exports     │  │  Metrics / Logs   │  │  Agent Conversations     │  │
│  │  Resource Metadata│  │  (Azure Monitor)  │  │  (Agent Workload)        │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────────┬─────────────┘  │
│           │                      │                          │                │
└───────────┼──────────────────────┼──────────────────────────┼────────────────┘
            │                      │                          │
            ▼                      ▼                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Microsoft Fabric                                    │
│                                                                             │
│  ┌─────────────────────────────────────┐   ┌────────────────────────────┐  │
│  │  Lakehouse (OneLake)                │   │  Mirrored Database         │  │
│  │  ├─ Files/                          │   │  Cosmos DB → Delta Tables  │  │
│  │  │   ├─ costs/          (shortcut)  │   │  (near-real-time sync)     │  │
│  │  │   ├─ metadata/       (shortcut)  │   └────────────┬───────────────┘  │
│  │  │   ├─ telemetry/      (shortcuts) │                │                  │
│  │  │   └─ diagnostics/    (shortcuts) │                │                  │
│  │  └─ Tables/dbo/                     │                │                  │
│  │      ├─ bronze_*  (raw Delta)       │◄───────────────┘                  │
│  │      ├─ silver_*  (cleansed Delta)  │                                   │
│  │      └─ gold_*    (aggregated Delta)│                                   │
│  └─────────────────┬───────────────────┘                                   │
│                    │                                                        │
│  ┌─────────────────▼───────────────────┐                                   │
│  │  Notebooks (PySpark)                │                                   │
│  │  01_bronze_ingestion                │                                   │
│  │  02_silver_transformation           │                                   │
│  │  03_gold_aggregation                │                                   │
│  │  04_cosmos_mirroring_transform      │                                   │
│  └─────────────────┬───────────────────┘                                   │
│                    │                                                        │
│  ┌─────────────────▼───────────────────┐                                   │
│  │  Pipelines                          │                                   │
│  │  ├─ Load E2E Pipeline               │                                   │
│  │  └─ Daily Refresh Pipeline          │                                   │
│  └─────────────────┬───────────────────┘                                   │
│                    │                                                        │
│  ┌─────────────────▼───────────────────┐   ┌────────────────────────────┐  │
│  │  Semantic Model (Direct Lake)       │──▶│  Power BI Reports          │  │
│  │  CostSummary, OperationalMetrics    │   │  Cost Overview             │  │
│  │  AgentAnalytics + dimensions        │   │  Operational Health        │  │
│  │  Measures: TotalCost, ErrorRate ... │   │  Performance               │  │
│  └─────────────────────────────────────┘   │  Agent Performance         │  │
│                                            │  Resource Inventory        │  │
│                                            └────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Prerequisites

| Requirement | Details |
|---|---|
| Azure subscription | Contributor access on the target resource group |
| Microsoft Fabric capacity | F2 or higher (F64+ recommended for production) |
| Python | 3.11 or later |
| Azure CLI | 2.60+ with `az login` completed |
| Azure Developer CLI (azd) | Latest version |
| GitHub OIDC | Federated credential configured for the repository |

## Deployment

### 1. Deploy Azure Infrastructure

Provision the storage account, key vault, and managed identity used by Fabric:

```bash
azd auth login
azd provision
```

This creates:

- **Storage Account** (ADLS Gen2) — landing zone for cost exports, metrics, and logs
- **Key Vault** — stores connection strings and Fabric API credentials
- **User-Assigned Managed Identity** — grants Fabric access to ADLS Gen2

### 2. Configure Fabric Workspace

In Fabric, create one **Azure Data Lake Storage Gen2** cloud connection for the storage account DFS
endpoint using **Organizational account** authentication. Copy the connection ID from the connection's
settings, then create the Fabric workspace, lakehouse, ADLS shortcuts, and import notebooks:

```bash
pip install -r src/setup/requirements.txt

python src/setup/setup_fabric_workspace.py \
  --workspace-name "Observability-Analytics" \
  --storage-account-url "https://<account>.dfs.core.windows.net" \
  --connection-id "<fabric-cloud-connection-id>" \
  --capacity-id "<fabric-capacity-id>"
```

The script performs the following:

1. Creates (or reuses) a Fabric workspace assigned to the specified capacity.
2. Creates an **Observability** lakehouse inside the workspace.
3. Adds ADLS Gen2 shortcuts under `Files/` for `costs`, `metadata`, the three required `am-*`
  application telemetry containers, and the two required `insights-*` diagnostic containers.
4. Uploads and imports all PySpark notebooks from `fabric/notebooks/`.
5. Creates the **Load E2E Pipeline** and **Daily Refresh Pipeline**.

### 3. Configure Cosmos DB Mirroring

Enable Fabric Mirroring for the Cosmos DB database containing agent conversations:

```bash
python src/setup/setup_cosmos_mirroring.py \
  --workspace-id "<workspace-id>" \
  --cosmos-account "<cosmos-account-name>" \
  --database "agentsdb" \
  --connection-id "<fabric-cosmos-connection-id>"
```

The script:

1. Resolves the participant-owned **Azure Cosmos DB v2** cloud connection by ID or account endpoint.
2. Creates a mirrored database definition for the Cosmos DB database in the Fabric workspace.
3. Starts replication and confirms that Mirroring reaches a running state. Verify that the
   `conversations` and `interactions` containers from Challenge 1 appear as mirrored tables.

### 4. Run Notebooks

Run the notebooks in order — either manually in Fabric or via the E2E pipeline:

| Order | Notebook | Purpose |
|---|---|---|
| 1 | `01_bronze_ingestion` | Load raw Parquet into Delta tables |
| 2 | `02_silver_transformation` | Cleanse, normalize, and enrich |
| 3 | `03_gold_aggregation` | Build analytical aggregates |
| 4 | `04_cosmos_mirroring_transform` | Transform mirrored conversation data |

To trigger all four in sequence, open the **Load E2E Pipeline** in Fabric and click **Run**.

## Notebooks

### 01_bronze_ingestion.ipynb

Reads raw Parquet files from ADLS Gen2 shortcuts and writes Delta tables into the schema-enabled Lakehouse `Tables/dbo/` section.

**Input**: `Files/costs/`, `Files/metadata/`, `Files/telemetry/apprequests/`,
`Files/telemetry/appdependencies/`, `Files/telemetry/appmetrics/`, `Files/diagnostics/audit/`,
`Files/diagnostics/platformmetrics/`
**Output**: `bronze_costs`, `bronze_metrics`, `bronze_logs`, `bronze_resource_metadata`

Key behaviors:

- Schema inference with explicit type overrides for known columns.
- Append mode with deduplication using `_source_file` and `_ingestion_timestamp` watermarks.
- Data quality checks: null key detection, row-count validation, schema-drift alerts.

### 02_silver_transformation.ipynb

Cleanses and transforms Bronze tables into an analysis-ready Silver layer.

**Transformations**:

- **Costs**: Normalizes raw billing data to the [FOCUS](https://focus.finops.org/) cost schema — standardized column names, currency conversion, amortization of reservations and savings plans.
- **Metrics**: Pivots time-series metric records from long to wide format; interpolates missing intervals; aligns to 5-minute grain.
- **Logs**: Parses semi-structured log messages; extracts severity, category, operation, and correlation ID; filters noise.
- **Resource Metadata**: Flattens nested resource properties and tag maps; adds computed columns for resource age, region normalization, and service categorization.

**Output**: `silver_costs`, `silver_metrics`, `silver_logs`, `silver_resource_metadata`

### 03_gold_aggregation.ipynb

Creates analytical aggregates consumed by the semantic model.

**Output tables**:

| Table | Description |
|---|---|
| `gold_cost_summary` | Daily/monthly cost aggregates by subscription, resource group, service, and tag |
| `gold_operational_metrics` | Error rates, latency percentiles (p50/p95/p99), availability per service |
| `gold_resource_inventory` | Current and historical resource state with SCD Type 2 tracking |
| `gold_agent_analytics` | Conversation counts, token usage, and response times by model and topic |

### 05_semantic_model_dimensions.ipynb

Creates the physical Direct Lake dimensions after notebooks 03 and 04 have populated the Gold layer.

| Table | Description |
|---|---|
| `dim_date` | Continuous calendar spanning the dates present in the four Gold data products |
| `dim_resource` | One current, deduplicated row per resource derived from `gold_resource_inventory` |

### 04_cosmos_mirroring_transform.ipynb

Transforms mirrored Cosmos DB conversation data into agent analytics.

**Input**: Mirrored tables `conversations`, `messages`, `feedback`
**Output**: `gold_agent_analytics`, `gold_conversation_details`

Key behaviors:

- Sessionizes messages into conversation threads.
- Calculates per-conversation metrics: message count, total tokens, elapsed time, resolution status.
- Aggregates conversations, interactions, token usage, and response time by model and topic.
- Handles late-arriving mirrored records with merge-on-read reconciliation.

## Pipeline Schedule

| Pipeline | Trigger | Scope |
|---|---|---|
| **Load E2E Pipeline** | Manual (workflow dispatch or Fabric UI) | Processes the last 3 months by default; configurable via `start_date` parameter |
| **Daily Refresh Pipeline** | Scheduled — daily at 06:00 UTC | Processes the current month with incremental append |

Both pipelines include:

- Dependency ordering: Bronze → Silver → Gold plus mirrored-agent transform → semantic-model dimensions.
- Retry policy: 2 retries with 5-minute backoff.
- Failure notifications via Fabric alerts (email and Teams webhook).

## Semantic Model

The Direct Lake semantic model connects Power BI directly to Delta tables in OneLake — no import or DirectQuery overhead.

### Tables and Relationships

```
Calendar (dim_date) ──1:*──▶ CostSummary
                    ├─1:*──▶ OperationalMetrics
                    └─1:*──▶ AgentAnalytics

ResourceInventory (dim_resource) ──1:*──▶ CostSummary
```

### Key Measures

| Measure | Expression (DAX) |
|---|---|
| TotalCost | `SUM(CostSummary[monthly_cost])` |
| CostMoMChange | Month-over-month cost change percentage |
| ErrorRate | `DIVIDE(SUM(OperationalMetrics[error_count]), SUM(OperationalMetrics[total_requests]), 0)` |
| P95Latency | `AVERAGE(OperationalMetrics[p95_latency_ms])` |
| TotalConversations | `SUM(AgentAnalytics[total_conversations])` |
| TotalTokens | `SUM(AgentAnalytics[total_tokens_used])` |

### Time Intelligence

The model includes YTD and prior-month cost measures using the physical `dim_date` table.

## Power BI Report

### Connecting to the Semantic Model

1. Open Power BI Desktop or the Power BI service.
2. Select **OneLake data hub** → choose the semantic model published from this workspace.
3. The connection uses **Direct Lake** mode — no data copy is created.

### Suggested Report Pages

| Page | Key Visuals |
|---|---|
| **Cost Overview** | KPI cards (total cost, MoM trend), cost-by-service bar chart, daily cost line chart with forecast, top-10 cost drivers table |
| **Operational Health** | Error-rate trend, P95 latency sparklines, availability scorecards, log-severity breakdown donut chart |
| **Agent Performance** | Conversation, interaction, and session volume; response time; token consumption by model and topic |
| **Resource Inventory** | Resource count by type/region matrix, change timeline (SCD events), tag compliance percentage, orphaned resource list |

### Design Guidelines

- Use the organization's brand palette for consistent theming.
- Apply row-level security (RLS) roles mapped to subscription or resource-group ownership.
- Enable paginated export for the Resource Inventory page.

## Integration with Other Components

| Component | Integration Point |
|---|---|
| **[Agent Workload](../agent-workload/README.md)** | AI-agent conversations are written to Cosmos DB. Fabric Mirroring replicates those records into the Lakehouse in near-real-time, where `04_cosmos_mirroring_transform` processes them into `gold_agent_analytics`. |
| **[Observability Ingestion](../observability-ingestion/README.md)** | Azure Monitor diagnostic settings export metrics, logs, and cost data to ADLS Gen2. Fabric Lakehouse shortcuts expose those files as if they were local, and the Bronze notebook ingests them into Delta tables. |

## Project Structure

```
fabric-control-tower/
├── .github/
│   └── workflows/
│       └── deploy.yml              # CI/CD pipeline
├── infra/
│   ├── main.bicep                  # Bicep entry point (storage, identity)
│   └── main.parameters.json        # Default parameters
├── fabric/
│   ├── notebooks/
│   │   ├── 01_bronze_ingestion.ipynb
│   │   ├── 02_silver_transformation.ipynb
│   │   ├── 03_gold_aggregation.ipynb
│   │   ├── 04_cosmos_mirroring_transform.ipynb
│   │   └── 05_semantic_model_dimensions.ipynb
│   └── pipelines/
│       ├── pipeline_load_e2e.json
│       └── pipeline_daily_refresh.json
├── src/
│   └── setup/
│       ├── requirements.txt
│       ├── semantic_model.json     # Direct Lake semantic model definition
│       ├── setup_fabric_workspace.py
│       └── setup_cosmos_mirroring.py
├── .gitignore
├── azure.yaml                      # azd manifest
└── README.md
```

## Contributing

1. Fork the repository and create a feature branch from `main`.
2. Follow existing code style — run `ruff check` and `ruff format` before committing.
3. Add or update tests for any new setup scripts.
4. Open a pull request with a clear description of your changes.
5. Ensure the CI pipeline passes before requesting review.

## License

This project is licensed under the [MIT License](../../LICENSE).
