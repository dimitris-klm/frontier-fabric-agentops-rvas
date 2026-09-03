# Challenge 2 — Build the Telemetry Landing Zone

> **Est. time:** 1.5–2 h · **Level:** 200 · **Roles:** Cloud/Platform engineer, FinOps practitioner, Data engineer

---

> **Mission log.**
> The agents are talking. Now the Control Tower needs a place for every signal to land — cost,
> metrics, logs, resource inventory, and platform diagnostics. Scattered telemetry is noise; a
> governed lake landing zone is the first step toward intelligence.

In this challenge your team builds the **Ingest** stage of the platform: a secure ADLS Gen2 landing
zone that Microsoft Fabric will read in Challenge 3 with OneLake shortcuts. You are not building the
dashboards yet. You are preparing the runway so the Control Tower can correlate reliability, cost, and
performance later.

## Objectives

By the end of this challenge you will have:

- Deployed the observability ingestion infrastructure in [`resources/observability-ingestion/`](../resources/observability-ingestion/).
- Created an **ADLS Gen2** storage account with managed `costs` and `metadata` containers.
- Observed Azure-created `am-*` containers for Log Analytics data export and `insights-*`
  containers for diagnostic settings.
- Enabled **Log Analytics data export** so application telemetry flows continuously to storage.
- Configured **Cost Management FOCUS** export for FinOps-ready Parquet cost data.
- Exported **Azure Resource Graph** metadata and tags to Parquet.
- Wired **diagnostic settings** so Azure platform logs and metrics land in the lake.
- Recorded the storage account coordinates Fabric will need next.

## Prerequisites

- ✅ Challenge 0 complete — Azure access, region, subscription, and roles confirmed.
- A Fabric workspace assigned to your team's Fabric capacity. Reuse the workspace created in
  Challenge 0; create one in the Fabric portal if it does not exist.
- **Cost Management Reader** at the billing/subscription scope for the person configuring cost export.
- The reference ingestion asset in
  [`resources/observability-ingestion/`](../resources/observability-ingestion/).
- Challenge 1 complete — this challenge reuses its resource group and Log Analytics workspace and
  gives you real agent workload telemetry to land.

## The landing zone

The provided ingestion layer lands four Azure signal families into one ADLS Gen2 account:

| Source | Physical container | Format | Cadence |
|---|---|---|---|
| Azure Cost Management | `costs` | FOCUS Parquet (Snappy) | Daily / triggered |
| Log Analytics data export | `am-appmetrics`, `am-apprequests`, `am-appdependencies`, `am-apptraces`, `am-appexceptions` | Newline-delimited JSON | Continuous |
| Azure Resource Graph | `metadata` | Parquet (Snappy) | On demand / scheduled |
| Diagnostic settings | `insights-*` containers such as `insights-logs-audit` and `insights-metrics-pt1m` | JSON | Continuous |

That storage account becomes the **OneLake shortcut target** in Challenge 3. Treat its name, resource
ID, and DFS endpoint as mission-critical coordinates.

```
Azure Monitor + Cost + Resource Graph + Diagnostics
                         │
                         ▼
ADLS Gen2 landing zone: costs · metadata · am-* · insights-*
                         │
                         ▼
Challenge 3: Fabric Lakehouse + OneLake shortcuts
```

## Your mission

### 1. Create the Fabric workspace identity

Complete this prerequisite in the Fabric portal before deploying the ingestion infrastructure:

1. Open the Fabric workspace created in Challenge 0, or create a workspace and assign it to your
  team's Fabric capacity.
2. Open **Workspace settings** > **Workspace identity**.
3. Select **+ Workspace identity** and wait for the identity to be created.
4. Copy the workspace identity **Object ID**. This is its Microsoft Entra principal ID, not the
  Fabric workspace ID or the identity's client ID.
5. From `resources/observability-ingestion`, select the same `azd` environment used by the earlier
  challenges and store the principal ID:

```bash
azd env select ctl-tower
azd env set FABRIC_WORKSPACE_IDENTITY_PRINCIPAL_ID <WORKSPACE_IDENTITY_OBJECT_ID>
```

The deployment grants this identity `Storage Blob Data Contributor` on the landing-zone storage
account. The identity will be used by Fabric connections and notebooks in the following steps.

### 2. Deploy the ingestion infrastructure

- Provision the ingestion stack from [`resources/observability-ingestion/`](../resources/observability-ingestion/).
- Confirm the deployment creates:
  - ADLS Gen2 storage with hierarchical namespace enabled
  - Managed `costs` and `metadata` containers
  - A data export rule on the existing Challenge 1 Log Analytics workspace
  - Cost Management FOCUS export
- Generate fresh Challenge 1 traffic after deployment so Log Analytics data export creates the
  relevant physical `am-*` containers.
- Capture the outputs for the storage account and Log Analytics workspace.

### 3. Verify platform diagnostics

- Confirm the Bicep deployment created a diagnostic setting on the reused Log Analytics workspace.
- Verify that its platform logs and metrics target both the landing-zone storage account and the
  Log Analytics workspace. Azure writes this data to physical `insights-*` containers; there is no
  single `diagnostics` container. No separate diagnostic setup script is required.

### 4. Land cost and resource metadata

- Trigger or confirm the **Cost Management FOCUS** export into the `costs` container.
- Create a Python virtual environment and run the **Resource Graph** metadata export once to seed
  the `metadata` container for the workshop.
- Confirm metadata includes resource IDs, names, types, locations, resource groups, tags, and
  subscription IDs.
- Watch for date-partitioned paths — this layout is what makes Spark reads efficient later.

### 5. Validate the data lake

- Inspect the managed and Azure-created containers and confirm files are appearing where expected.
- Validate file counts, total sizes, latest timestamps, and sample Parquet schemas.
- Pay special attention to:
  - `costs/focus/...` — FOCUS Parquet
  - `metadata/resource-graph/...` — Resource Graph Parquet
  - `am-apprequests`, `am-appdependencies`, and `am-appmetrics` — Challenge 1 telemetry exported
    from Log Analytics
  - Other `am-*` containers — exported tables that have produced records after export was enabled
  - `insights-*` containers — diagnostic settings output

### 6. Record the coordinates for Fabric

Before moving on, write down:

- Storage account name
- Storage account resource ID
- DFS endpoint URL: `https://<storage-account>.dfs.core.windows.net`
- Log Analytics workspace name and resource ID
- Cost export name

Challenge 3 depends on these values to create OneLake shortcuts without copying data.

## Success criteria

- [ ] Fabric workspace identity exists and its Object ID is stored in the selected `azd` environment
- [ ] ADLS Gen2 storage exists with hierarchical namespace enabled
- [ ] Managed `costs` and `metadata` containers exist
- [ ] FOCUS cost Parquet is present in `costs` and validated
- [ ] Resource Graph metadata Parquet is present in `metadata`
- [ ] Log Analytics data export rule is enabled for app request/dependency/trace/exception/metric tables
- [ ] Azure-created `am-*` containers contain the Challenge 1 tables that have emitted post-enable telemetry
- [ ] The Log Analytics workspace diagnostic setting targets storage and Log Analytics, with output
  appearing in `insights-*` containers after platform telemetry is emitted
- [ ] `validate_exports.py` reports file counts, sizes, latest timestamps, and schemas
- [ ] The team has recorded the storage account name, resource ID, and DFS endpoint URL

> 🧭 **Checkpoint:** show your coach the `costs` and `metadata` containers, the Azure-created
> `am-*` and `insights-*` containers, one FOCUS Parquet file, one Resource Graph Parquet file, the
> active Log Analytics export rule, and your recorded Fabric shortcut coordinates.

## Hints

<details>
<summary>Deploying the ingestion layer</summary>

```bash
cd resources/observability-ingestion
azd auth login
azd up      # use the same subscription and region from Challenge 0
```

After deployment, capture the outputs:

- `AZURE_STORAGE_ACCOUNT_NAME`
- `AZURE_STORAGE_ACCOUNT_ID`
- `AZURE_LOG_ANALYTICS_WORKSPACE_NAME`
- `AZURE_LOG_ANALYTICS_WORKSPACE_ID`

</details>

<details>
<summary>Exporting Resource Graph metadata</summary>

```bash
cd resources/observability-ingestion/src/scripts
python -m venv .venv
```

Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

macOS/Linux:

```bash
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Run the one-time seed:

```bash
python resource_graph_export.py \
  --subscription-id <SUBSCRIPTION_ID> \
  --storage-account <STORAGE_ACCOUNT_NAME> \
  --container metadata
```

The script writes Parquet files under `metadata/resource-graph/year=*/month=*/day=*/`.
</details>

<details>
<summary>Validating the landing zone</summary>

```bash
cd resources/observability-ingestion/src/scripts

python validate_exports.py \
  --storage-account <STORAGE_ACCOUNT_NAME>
```

The validator discovers physical `am-*` and `insights-*` containers automatically. If an expected
Azure-created container is absent, the corresponding export may not have emitted data yet; generate
fresh traffic or wait for diagnostic output, then run the validator again.
</details>

<details>
<summary>Why FOCUS matters</summary>

FOCUS is the FinOps Open Cost and Usage Specification. It gives the Control Tower standardized fields
such as `BilledCost`, `EffectiveCost`, `ServiceName`, `ResourceId`, and `Tags`, so Challenge 4 can
join spend to resource metadata and Challenge 5 can show cost by service, team, and use case.
</details>

## Resources

- [`resources/observability-ingestion/README.md`](../resources/observability-ingestion/README.md) — landing zone deployment and scripts
- [`resources/observability-ingestion/src/scripts/`](../resources/observability-ingestion/src/scripts/) — Resource Graph and validation scripts
- [`docs/architecture.md`](../docs/architecture.md) — the Ingest stage and data layout
- Previous: **[Challenge 1 — Light Up the Agents](challenge-01-agent-telemetry.md)**

---

➡️ Next: **[Challenge 3 — Connect Fabric to the Enterprise](challenge-03-onelake-foundation.md)**
