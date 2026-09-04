# Coach Guide — Challenge 4: Refine the Signal

> Attendee challenge: [`challenges/challenge-04-medallion-pipeline.md`](../challenges/challenge-04-medallion-pipeline.md)

## Snapshot

| | |
|---|---|
| **Est. time** | 2–2.5 h |
| **Difficulty** | ⭐⭐⭐ (300) |
| **They build** | Bronze → Silver → Gold medallion pipeline with correlated Gold data products |
| **Key services** | Fabric Lakehouse/Spark notebooks, Delta, Data pipelines |

## Coaching objectives

This is the data-engineering core of the RVAS. Keep teams focused on **correlation**, not just
"notebooks ran." The Control Tower becomes valuable when cost, telemetry, resource metadata, and agent
activity can be joined into one operational story.

Make sure they can explain the medallion rationale:

- **Bronze = fidelity and reprocessability** — raw inputs plus lineage.
- **Silver = trust and standardization** — FOCUS cost, parsed telemetry, flattened metadata.
- **Gold = speed and business meaning** — aggregates and dimensions ready for Direct Lake.

**What good looks like:** Load E2E Pipeline is green; every expected Gold table has rows; the team shows
one query joining cost with agent activity or telemetry and can describe the join path.

## The reference path

Run from the Fabric workspace created in Challenge 3. If the setup script was used, the notebooks and
pipelines are already imported from [`resources/fabric-control-tower/`](../resources/fabric-control-tower/).

### Notebook map

| Order | Notebook | Layer | What to look for |
|---|---|---|---|
| 1 | `01_bronze_ingestion.ipynb` | Bronze | Raw shortcut files become `bronze_*` Delta tables with lineage and quality checks |
| 2 | `04_cosmos_mirroring_transform.ipynb` | Agent feed | Mirrored conversations/interactions are shaped for agent analytics and late-arriving records |
| 3 | `02_silver_transformation.ipynb` | Silver | FOCUS cost normalization, 5-minute metrics, parsed logs, flattened metadata |
| 4 | `03_gold_aggregation.ipynb` | Gold | Aggregated Gold data products for cost, operations, capacity, inventory, and dimensions |

The attendee guide frames the main path as Bronze → Silver → Gold. In the reference assets, the Cosmos
mirroring transform can run after Bronze and contributes the agent analytics product; coach teams to
verify it is included before they declare Gold complete.

### Manual run vs pipeline run

For debugging, run notebooks manually in dependency order and inspect output row counts after each one.
For the checkpoint, require the **Load E2E Pipeline**:

- Pipeline file: [`pipeline_load_e2e.json`](../resources/fabric-control-tower/fabric/pipelines/pipeline_load_e2e.json)
- Activities: Bronze Ingestion → Silver Transformation → Gold Aggregation, plus Cosmos Mirroring
  Transform after Bronze.
- Parameters: `FromMonth` defaults to `-3`; `ToMonth` defaults to `0`.
- Policy: notebook activities have retries and dependency conditions.

> ⚠️ **Coach note — the `WebhookUrl` parameter has no backing endpoint.** The pipeline's
> `Send Failure Notification` web activity POSTs to `WebhookUrl`, whose default is a placeholder. No
> Bicep or setup script in this repo provisions a Logic App or webhook. Teams must supply their own
> HTTP-triggered Logic App URL at run time; otherwise the notification activity fails on top of any
> upstream notebook failure and muddies the diagnosis.

Point out the incremental operating path:

- Pipeline file: [`pipeline_daily_refresh.json`](../resources/fabric-control-tower/fabric/pipelines/pipeline_daily_refresh.json)
- Trigger: daily at 06:00 UTC.
- Scope: calls the Load E2E Pipeline with a rolling one-month window.

### Expected Gold tables

Match the table list in [`docs/architecture.md`](../docs/architecture.md#the-gold-data-products):

- `gold_cost_summary`
- `gold_operational_metrics`
- `gold_agent_analytics`
- `gold_capacity_usage`
- `gold_resource_inventory` (SCD Type 2)
- `dim_date`
- `dim_resource`

If a team has only single-source Gold tables, push them to the correlation proof before passing the
checkpoint.

## Sample correlation query

Use this as a coaching pattern, not a hard contract. Teams may need to adapt the tag expression to how
their `metadata` export represents tags. The agent namespace should follow the architecture pattern:
`<organization>.<domain>.<agent-name>.<version>`.

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

A second acceptable proof is operational: join `gold_operational_metrics` and `gold_cost_summary` by
service/time to show error rate or P95 latency beside cost.

## Checkpoint verification

Ask the team to show:

1. **Bronze proof** — `bronze_*` tables exist and include lineage columns / quality-check output.
2. **Silver proof** — cost is normalized, metrics are at the intended grain, logs are parsed, metadata
   tags are flattened enough for joins.
3. **Gold proof** — all expected Gold data products exist and have non-zero row counts where source data
   exists.
4. **Pipeline proof** — recent **Load E2E Pipeline** run succeeded end-to-end; dependencies and retries
   are visible in the run details.
5. **Correlation proof** — one query or visual joins cost with agent activity, resource tags, or
   operational telemetry.
6. **Rationale proof** — one team member explains Bronze/Silver/Gold without reading the doc.

✅ Pass when Gold is populated, the pipeline is green, and the correlation proof is real.

## Common pitfalls & fixes

| Pitfall | Fix |
|---|---|
| Notebooks are not attached to the Lakehouse | Attach the `Observability` Lakehouse before running; relative `Files/` and `Tables/` paths depend on it |
| Shortcut path confusion: `Files/` vs `Tables/` | Raw shortcut inputs live under `Files/`; Delta outputs are written under `Tables/` |
| Schema drift in raw Parquet breaks Bronze or Silver | Inspect the new columns, update explicit casts/mappings, and keep Bronze raw for replay |
| Mirrored tables are late-arriving or empty | Check Mirroring status, generate new agent traffic, rerun the Cosmos transform after records arrive |
| Pipeline dependency ordering changed | Restore Bronze before Silver, Silver before Gold, and include Cosmos transform after Bronze |
| `Send Failure Notification` activity fails with a DNS or 404 error | The `WebhookUrl` placeholder was left in place. Provision a Logic App / HTTP webhook and pass its URL as the pipeline parameter, or accept that this activity fails and read the upstream notebook error instead |
| FOCUS normalization edge cases | Validate currency, amortization, service names, and missing cost fields before Gold aggregation |
| F2 capacity runs slow or hits Spark pressure | Reduce the date window, run notebooks sequentially, and avoid unnecessary full refreshes |
| Gold query scans too much data | Filter by date/service first; partition or optimize high-traffic Gold tables if time allows |

## Talking points (mini-briefing)

- **Bronze protects optionality.** When a schema or business rule changes, you can replay from raw
  Delta rather than rebuild the landing zone.
- **Silver is where trust is earned.** Standardized FOCUS costs and conformed telemetry make cross-source
  joins defensible.
- **Gold is a product, not a dump.** It should be fast, named for business questions, and shaped for
  Direct Lake consumption.
- **Correlation is the Control Tower moment.** A dashboard that shows cost, traces, and agents in
  separate panels is still fragmented; joined insight is what leadership asked for.
- **Automation matters.** Pipelines, retries, alerts, and refresh windows are what turn notebooks into
  an operating platform.

## If they finish early

- Add a data-quality assertion that fails the pipeline when a key Gold table has zero rows.
- Partition or Z-order a high-use Gold table and compare query time before/after.
- Add a new Gold metric, such as cost per conversation or tokens per dollar, using existing Gold tables.
- Add a small validation notebook activity after Gold and before semantic-model refresh.
- Sketch how Challenge 5 visuals will map to each Gold data product.

## Reference assets

- [`resources/fabric-control-tower/README.md`](../resources/fabric-control-tower/README.md) — notebooks, pipelines, and semantic model sections
- [`resources/fabric-control-tower/fabric/notebooks/01_bronze_ingestion.ipynb`](../resources/fabric-control-tower/fabric/notebooks/01_bronze_ingestion.ipynb)
- [`resources/fabric-control-tower/fabric/notebooks/02_silver_transformation.ipynb`](../resources/fabric-control-tower/fabric/notebooks/02_silver_transformation.ipynb)
- [`resources/fabric-control-tower/fabric/notebooks/03_gold_aggregation.ipynb`](../resources/fabric-control-tower/fabric/notebooks/03_gold_aggregation.ipynb)
- [`resources/fabric-control-tower/fabric/notebooks/04_cosmos_mirroring_transform.ipynb`](../resources/fabric-control-tower/fabric/notebooks/04_cosmos_mirroring_transform.ipynb)
- [`resources/fabric-control-tower/fabric/pipelines/pipeline_load_e2e.json`](../resources/fabric-control-tower/fabric/pipelines/pipeline_load_e2e.json)
- [`resources/fabric-control-tower/fabric/pipelines/pipeline_daily_refresh.json`](../resources/fabric-control-tower/fabric/pipelines/pipeline_daily_refresh.json)
- [`docs/architecture.md`](../docs/architecture.md) — Gold products and agent namespace pattern
