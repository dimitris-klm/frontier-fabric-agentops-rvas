# Observability Ingestion — Reference Component

> **Part of the [Frontier Fabric AgentOps RVAS](../../README.md).** This component is the
> **telemetry landing zone** you build in **[Challenge 2](../../challenges/challenge-02-landing-zone.md)** —
> Azure infrastructure and export scripts that land cost, metrics, logs, diagnostics, and resource
> metadata into ADLS Gen2 so Fabric can shortcut to it in later challenges.

Azure infrastructure and scripts that ingest observability data from the Azure Control Plane, Azure Monitor, and Cost Management into an ADLS Gen2 landing zone.

## Architecture Overview

This component provisions the **landing zone** of the AgentOps Control Tower:

```
┌──────────────────────────────────────────────────────────────────────┐
│                       Azure Control Plane                           │
│                                                                     │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │ Cost Management  │  │ Resource Graph   │  │ Diagnostic        │  │
│  │ (FOCUS Export)   │  │ (Metadata/Tags)  │  │ Settings          │  │
│  └────────┬────────┘  └────────┬─────────┘  └────────┬──────────┘  │
│           │                    │                      │             │
│  ┌────────┴────────────────────┴──────────────────────┴──────────┐  │
│  │                   ADLS Gen2 Storage Account                   │  │
│  │  ┌───────┐ ┌────────┐ ┌──────┐ ┌──────────┐ ┌─────────────┐ │  │
│  │  │ costs │ │metrics │ │ logs │ │ metadata │ │ diagnostics │ │  │
│  │  └───────┘ └────────┘ └──────┘ └──────────┘ └─────────────┘ │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─────────────────────┐                                           │
│  │ Log Analytics        │──── Data Export Rules ──────────┐        │
│  │ Workspace            │                                 │        │
│  └──────────┬───────────┘                                 ▼        │
│             │                                     Storage Account  │
│             ▼                                                      │
│    Application Insights                                            │
│    (AppRequests, AppTraces,                                        │
│     AppDependencies, etc.)                                         │
└──────────────────────────────────────────────────────────────────────┘
```

### Data Flows

| Source | Container | Format | Schedule |
|---|---|---|---|
| Azure Cost Management | `costs` | FOCUS Parquet (Snappy) | Daily |
| Azure Resource Graph | `metadata` | Parquet (Snappy) | One-time lab seed |
| Log Analytics Data Export | `metrics`, `logs` | JSON | Continuous |
| Diagnostic Settings | `diagnostics` | JSON | Continuous |

## Prerequisites

- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) v2.60+
- [Azure Developer CLI (azd)](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd) v1.9+
- An Azure subscription with **Contributor** and **Cost Management Reader** permissions
- A Fabric workspace assigned to a Fabric capacity
- Workspace administrator access to create the Fabric workspace identity
- Python 3.11+

## Deployment

### Create the Fabric workspace identity

In the Fabric portal:

1. Open the workspace created for the workshop, or create one and assign it to your Fabric capacity.
2. Open **Workspace settings** > **Workspace identity**.
3. Select **+ Workspace identity**.
4. Copy the identity **Object ID**. Do not use the Fabric workspace ID or client ID.
5. Store the Object ID in the `azd` environment used for the workshop:

```bash
azd env select ctl-tower
azd env set FABRIC_WORKSPACE_IDENTITY_PRINCIPAL_ID <WORKSPACE_IDENTITY_OBJECT_ID>
```

The Bicep deployment uses this principal ID to grant the workspace identity `Storage Blob Data
Contributor` on the landing-zone storage account.

### With Azure Developer CLI

```bash
# Authenticate
azd auth login

# Provision infrastructure
azd provision
```

You will be prompted for:
- **Environment name** — a short identifier (e.g., `dev`, `demo`)
- **Azure location** — region for all resources (e.g., `eastus2`)
- **Azure subscription** — the target subscription

### Manual Bicep Deployment

```bash
az deployment group create \
  --resource-group rg-observability-demo \
  --template-file infra/main.bicep \
  --parameters infra/main.parameters.json \
  --parameters environmentName=demo location=eastus2
```

## Seed and Validate the Landing Zone

The scripts are a one-time workshop bootstrap. They make data available immediately without adding
a production scheduler before the Fabric data path is built. Challenge 6 can move the same exporter
to unattended cloud execution without changing its ADLS data contract.

Authenticate with Azure, then create an isolated Python environment:

```bash
az login
cd src/scripts
python -m venv .venv
```

Activate it on Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Or activate it on macOS/Linux:

```bash
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

### Resource Graph Export

Queries Azure Resource Graph for resource metadata and exports to ADLS Gen2:

```bash
python resource_graph_export.py \
  --subscription-id <SUBSCRIPTION_ID> \
  --storage-account <STORAGE_ACCOUNT_NAME> \
  --container metadata
```

Diagnostic settings for the reused Log Analytics workspace are deployed by Bicep. No setup script is
required.

### Validate Exports

Inspects storage containers and reports on ingested data:

```bash
python validate_exports.py \
  --storage-account <STORAGE_ACCOUNT_NAME>
```

## Data Format Reference

### FOCUS Cost Format

The Cost Management export uses the [FinOps Open Cost and Usage Specification (FOCUS)](https://focus.finops.org/) format. Key columns:

| Column | Description |
|---|---|
| `BillingAccountId` | Billing account identifier |
| `BillingPeriodStart` | Start of billing period |
| `ChargeCategory` | Usage, Purchase, Tax, etc. |
| `BilledCost` | Amount billed |
| `EffectiveCost` | Net cost after discounts |
| `PricingUnit` | Unit of pricing |
| `ResourceId` | Azure resource ID |
| `ResourceName` | Resource display name |
| `ServiceName` | Azure service name |
| `Tags` | Resource tags as JSON |

### Resource Graph Parquet Schema

Exported by `resource_graph_export.py`:

| Column | Type | Description |
|---|---|---|
| `id` | string | Full resource ID |
| `name` | string | Resource name |
| `type` | string | Resource type (e.g., `Microsoft.Compute/virtualMachines`) |
| `location` | string | Azure region |
| `resourceGroup` | string | Resource group name |
| `tags` | map | Resource tags |
| `subscriptionId` | string | Subscription ID |

## Storage Layout

```
<storage-account>/
├── costs/
│   └── focus/
│       └── <yyyyMMdd-yyyyMMdd>/
│           └── *.parquet          # FOCUS cost data
├── metrics/
│   └── am-<workspace>/
│       └── AppMetrics/
│           └── y=*/m=*/d=*/h=*/  # Log Analytics metrics export
├── logs/
│   └── am-<workspace>/
│       └── App*/
│           └── y=*/m=*/d=*/h=*/  # Log Analytics log export
├── metadata/
│   └── resource-graph/
│       └── year=*/month=*/day=*/
│           ├── all_resources_with_tags_*.parquet
│           ├── resource_counts_by_type_*.parquet
│           └── resources_by_location_*.parquet
└── diagnostics/
    └── insights-*/
        └── resourceId=*/
            └── y=*/m=*/d=*/h=*/  # Diagnostic settings output
```

## Integration with the Fabric Control Tower

This landing zone is the data source for the **[Fabric Control Tower](../fabric-control-tower/README.md)** you connect in **[Challenge 3](../../challenges/challenge-03-onelake-foundation.md)**. The ADLS Gen2 storage account serves as a OneLake shortcut target:

1. **Fabric Lakehouse** creates shortcuts to each container in this storage account
2. **Spark notebooks** read Parquet cost data and resource metadata
3. **Power BI** datasets are built on top of the lakehouse tables
4. **Cost dashboards** combine FOCUS cost data with resource tags for showback/chargeback

The storage account uses hierarchical namespace (ADLS Gen2) and date-partitioned directories for optimal Spark performance.

## Infrastructure Resources

| Resource | Purpose |
|---|---|
| ADLS Gen2 Storage Account | Central data landing zone |
| Log Analytics Workspace | Log and metric collection |
| Data Export Rules | Continuous export from workspace to storage |
| Cost Management Export | Daily FOCUS cost data |
| Diagnostic Settings | Log Analytics platform logs and metrics routed to the landing zone |

## CI/CD

Two GitHub Actions workflows automate deployment:

- **deploy.yml** — provisions infrastructure on push to `main` and runs the resource graph export
- **scheduled-export.yml** — runs the resource graph export daily at 2:00 AM UTC via cron

Both workflows use OIDC (federated credentials) for passwordless Azure authentication.
