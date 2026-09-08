# Challenge 4 — Refine the Signal

> **Est. time:** 2–2.5 h · **Level:** 300 · **Roles:** Data engineer, Fabric engineer, FinOps practitioner

---

> **Mission log.**
> The Control Tower can see the enterprise now: cost exports, telemetry files, resource metadata, and
> mirrored agent conversations are all inside Fabric's reach. But raw signal is still noisy signal.
> Leadership does not need another data swamp — they need trusted products that correlate **cost,
> reliability, and agent activity**.

In this challenge you build the data-engineering heart of the Control Tower: a **Bronze → Silver →
Gold** medallion pipeline over the OneLake shortcuts and mirrored Cosmos data from Challenge 3. The
win is not just populated tables. The win is correlation — proving that Fabric can connect the cost of
running agents to the services, telemetry, resources, and conversations that created that spend.

> ⚠️ **Before you run the pipeline.** The **Load E2E Pipeline** ends with a `Send Failure Notification`
> web activity that POSTs to the `WebhookUrl` pipeline parameter. Nothing in this repo provisions that
> endpoint — you must supply your own **Logic App** (or any HTTP-triggered webhook) and pass its URL when
> you run the pipeline. Leaving the placeholder default in place means the notification activity itself
> fails whenever an upstream notebook fails.

## Objectives

By the end of this challenge you will have:

- Ingested raw shortcut-backed files and mirrored Cosmos tables into Bronze Delta tables with lineage.
- Standardized the raw signal into trusted Silver tables, including FOCUS-normalized cost data.
- Built Gold data products for reliability, cost, performance, capacity, inventory, and agent analytics.
- Orchestrated the medallion flow with the **Load E2E Pipeline**.
- Demonstrated at least one **correlated** insight that joins cost with agent or telemetry context.

## Prerequisites

- ✅ Challenge 3 complete — the Fabric Lakehouse has OneLake shortcuts and Cosmos DB Mirroring.
- Shortcuts under the Lakehouse `Files/` area for `costs`, `metrics`, `logs`, and `metadata`.
- Mirrored Cosmos tables for the agent conversation data selected in Challenge 3.
- The imported notebooks and pipelines from
  [`resources/fabric-control-tower/`](../resources/fabric-control-tower/).
- A teammate who can run Fabric notebooks and data pipelines in the workspace.

## The refinement path

The architecture now moves from connected data to usable data products:

```text
OneLake shortcuts + mirrored Cosmos tables
          │
          ▼
Bronze — raw Delta with lineage and quality checks
          │
          ▼
Silver — cleansed, conformed, standardized FOCUS + telemetry
          │
          ▼
Gold — correlated data products for the Control Tower
          │
          ▼
Challenge 5 — Direct Lake semantic model and dashboards
```

Keep the purpose of each layer crisp:

| Layer | What it protects | What it enables |
|---|---|---|
| **Bronze** | Full-fidelity raw records, replay, lineage | Reprocessing when schemas or rules change |
| **Silver** | Trusted, typed, standardized data | Consistent joins across cost, metrics, logs, and metadata |
| **Gold** | Business-ready aggregates and dimensions | Fast Direct Lake dashboards and operational decisions |

## Your mission

### 1. Land the raw signal in Bronze

Use the Bronze ingestion path to turn the Challenge 3 inputs into raw Delta tables.

- Read raw Parquet from the shortcut-backed `Files/` paths for cost, metrics, logs, and metadata.
- Bring mirrored Cosmos conversation data into the same processing flow.
- Preserve lineage columns such as source file and ingestion timestamp so the team can explain where a
  row came from.
- Run the data-quality checks: row counts, required-key checks, and schema-drift detection.
- Use the reference notebooks as the implementation map:
  - `01_bronze_ingestion.ipynb` — shortcut-backed telemetry and metadata files.
  - `04_cosmos_mirroring_transform.ipynb` — mirrored conversation records and late-arriving data.

### 2. Standardize and trust it in Silver

Use the Silver transformation path to make the raw signal joinable.

- Normalize cost data to the [FOCUS](https://focus.finops.org/) shape used by the Control Tower.
- Pivot platform metrics to a 5-minute grain so trends can line up with operational events.
- Parse logs into useful severity, category, operation, and correlation fields.
- Flatten resource metadata and tags so cost and telemetry can be attributed to services, teams, and
  agent namespaces.
- Confirm the Silver outputs are typed, deduplicated, and clean enough to become Gold inputs.

The reference path for this layer is `02_silver_transformation.ipynb`.

### 3. Build the Gold data products

Gold is where the Control Tower starts answering business questions. Build the analytics-ready tables
listed in the reference architecture:

| Gold table | Why it matters |
|---|---|
| `gold_cost_summary` | Daily/monthly cost by service, resource group, tag, and time window |
| `gold_operational_metrics` | Error rates, latency percentiles, and availability by service |
| `gold_capacity_usage` | Utilization signals for capacity planning |
| `gold_resource_inventory` | SCD Type 2 resource inventory and governance history |
| `gold_agent_analytics` | Conversations, tokens, response time, and satisfaction by agent |
| `dim_date`, `dim_resource` | Conformed dimensions for time intelligence and drill-down |

Use `03_gold_aggregation.ipynb` for the Gold aggregation path, with
`04_cosmos_mirroring_transform.ipynb` feeding the agent analytics product.

### 4. Orchestrate the load

Run the **Load E2E Pipeline** instead of treating this as four disconnected notebooks.

- Confirm the pipeline orders the work as Bronze → Silver → Gold, with the mirrored-agent transform
  included.
- Use the pipeline parameters to process the intended date/month window.
- Watch dependency ordering, retries, and failure notifications.
- Confirm the final semantic-model refresh activity is ready for Challenge 5.
- Note the **Daily Refresh Pipeline** as the incremental path after the initial load is green.

### 5. Prove the signal is correlated

This is the checkpoint that matters most. Show one result that joins multiple domains, for example:

- Cost attributed to an agent namespace such as `<organization>.<domain>.<agent-name>.<version>`.
- Error rate or P95 latency compared with monthly cost for the same service.
- Token volume and response time beside the resource tags or service that owns the workload.

If the result only shows one source at a time, it is still a dashboard ingredient — not a Control Tower
insight yet.

## Success criteria

- [ ] Bronze Delta tables exist for the shortcut-backed telemetry/cost/metadata inputs.
- [ ] Mirrored Cosmos conversation data is represented in the medallion flow.
- [ ] Silver tables are cleansed, deduplicated, and standardized, including FOCUS-normalized cost.
- [ ] Gold tables are populated: `gold_cost_summary`, `gold_operational_metrics`,
      `gold_capacity_usage`, `gold_resource_inventory`, `gold_agent_analytics`, `dim_date`, and
      `dim_resource`.
- [ ] The **Load E2E Pipeline** runs green end-to-end with dependency ordering and retries intact.
- [ ] Your team can show one correlated result joining cost with agent activity or telemetry.
- [ ] Your team can explain why Bronze, Silver, and Gold are separate layers.

> 🧭 **Checkpoint:** show your coach the successful pipeline run, row counts for each Gold data product,
> and one correlated query or visual that joins cost with agent or telemetry context.

## Hints

<details>
<summary>Which notebook does what?</summary>

| Notebook | Layer | Purpose |
|---|---|---|
| `01_bronze_ingestion.ipynb` | Bronze | Loads raw shortcut-backed files into Delta with lineage and quality checks |
| `02_silver_transformation.ipynb` | Silver | Cleanses, normalizes FOCUS cost, pivots metrics, parses logs, flattens metadata |
| `03_gold_aggregation.ipynb` | Gold | Builds cost, operational, capacity, inventory, date, and resource products |
| `04_cosmos_mirroring_transform.ipynb` | Bronze/Gold feed | Processes mirrored Cosmos conversation data into agent analytics |

Run them manually in that order if you are debugging. Use the **Load E2E Pipeline** once each notebook
works on its own.
</details>

<details>
<summary>Sample correlation query idea</summary>

Adapt the tag predicate to the tags your Challenge 2 metadata exported. The pattern is the point: cost,
resource metadata, and agent activity meet in Gold.

```sql
WITH current_resources AS (
  SELECT resource_id, resource_group, region, tags
  FROM gold_resource_inventory
  WHERE is_current = true
), agent_usage AS (
  SELECT agent_id, interaction_date, total_tokens, conversation_count, avg_response_time_ms
  FROM gold_agent_analytics
)
SELECT
  a.agent_id AS agent_namespace,
  c.cost_year,
  c.cost_month,
  c.service_name,
  SUM(c.monthly_cost) AS monthly_cost,
  SUM(a.total_tokens) AS total_tokens,
  SUM(a.conversation_count) AS conversations,
  AVG(a.avg_response_time_ms) AS avg_response_time_ms
FROM gold_cost_summary c
JOIN current_resources r
  ON c.region = r.region
JOIN agent_usage a
  ON r.tags LIKE CONCAT('%', a.agent_id, '%')
GROUP BY a.agent_id, c.cost_year, c.cost_month, c.service_name
ORDER BY monthly_cost DESC;
```
</details>

<details>
<summary>What to check when a Gold table is empty</summary>

Work backwards. Is the Gold notebook reading the expected Silver table? Did the Silver table receive
rows from Bronze? Can Bronze read the `Files/` shortcut or mirrored table? Most empty-Gold failures are
upstream path, schema, or date-window issues — not aggregation math.
</details>

<details>
<summary>Why the Daily Refresh Pipeline matters</summary>

The Load E2E Pipeline is the first full build. The Daily Refresh Pipeline is the operating model: it
runs the E2E load on a rolling window so new cost, metrics, logs, metadata, and mirrored conversations
continue to land without a manual notebook click.
</details>

## Resources

- [`docs/architecture.md`](../docs/architecture.md) — medallion layers, Gold data products, agent namespace pattern
- [`resources/fabric-control-tower/README.md`](../resources/fabric-control-tower/README.md) — notebooks, pipelines, and semantic model
- [`resources/fabric-control-tower/fabric/notebooks/`](../resources/fabric-control-tower/fabric/notebooks/) — medallion notebooks
- [`resources/fabric-control-tower/fabric/pipelines/pipeline_load_e2e.json`](../resources/fabric-control-tower/fabric/pipelines/pipeline_load_e2e.json) — Load E2E Pipeline
- [`resources/fabric-control-tower/fabric/pipelines/pipeline_daily_refresh.json`](../resources/fabric-control-tower/fabric/pipelines/pipeline_daily_refresh.json) — Daily Refresh Pipeline

---

⬅️ Previous: **[Challenge 3 — Connect Fabric to the Enterprise](challenge-03-onelake-foundation.md)**  
➡️ Next: **[Challenge 5 — Stand Up the Control Tower](challenge-05-control-tower-dashboards.md)**
