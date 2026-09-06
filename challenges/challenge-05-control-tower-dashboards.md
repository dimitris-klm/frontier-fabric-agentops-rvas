# Challenge 5 — Stand Up the Control Tower

> **Est. time:** 2–2.5 h · **Level:** 300 · **Roles:** BI engineer, data engineer, FinOps practitioner

---

> **Mission log.**
> The lake is full, the Gold tables are polished, and leadership is done waiting for screenshots from
> five different portals. This is the payoff: turn the medallion data products into a live **AgentOps
> Control Tower** that answers the three questions in one place — reliability, cost, and performance.

In this challenge your team builds the semantic model and Power BI report that the customer will use
in the showcase. The goal is not a beautiful wallpaper dashboard; it is a single pane of glass that can
answer operational questions **live** from the Gold Delta tables.

## Objectives

By the end of this challenge you will have:

- A **Direct Lake semantic model** over the four Challenge 4 Gold tables and two physical dimensions.
- Relationships from facts to the date and resource dimensions so filters behave correctly.
- Core DAX measures for cost, reliability, performance, and agent adoption.
- Power BI report pages mapped to the three business questions:
  **Reliability**, **Cost**, and **Performance**.
- Proof that the model reads Delta directly — no import dataset, no scheduled data refresh.

## Prerequisites

- ✅ Challenge 4 complete — populated Gold tables in the Fabric Lakehouse.
- `05_semantic_model_dimensions.ipynb` completed — populated `dim_date` and `dim_resource` tables.
- The Fabric Control Tower assets in
  [`resources/fabric-control-tower/`](../resources/fabric-control-tower/).
- The semantic model reference at
  [`resources/fabric-control-tower/src/setup/semantic_model.json`](../resources/fabric-control-tower/src/setup/semantic_model.json).
- The architecture north star in [`docs/architecture.md`](../docs/architecture.md), especially the
  Gold data products and Core KPIs.

## The dashboard contract

Your report must answer the same questions the customer asked on day one:

| Business question | What the Control Tower must show |
|---|---|
| **Reliability** | Which agents are healthy? Where are errors, latency spikes, and pipeline issues coming from? |
| **Cost** | What is each service and Azure resource costing? Which drivers are changing fastest? |
| **Performance** | Are we meeting SLAs? How much traffic, token usage, and response time are we seeing? |

The Gold layer gives you the data products. The semantic model makes them trustworthy. The report makes
them usable under pressure.

## Your mission

### 1. Create the Direct Lake semantic model

Build or import a semantic model over the Gold Delta tables produced in Challenge 4:

- `gold_cost_summary`
- `gold_operational_metrics`
- `gold_agent_analytics`
- `dim_resource`
- `dim_date`

Use the provided
[`src/setup/semantic_model.json`](../resources/fabric-control-tower/src/setup/semantic_model.json) as
the reference for table bindings, Direct Lake partitions, relationships, and starter measures. If your
workspace uses the provided display names, you may see tables such as `CostSummary`,
`OperationalMetrics`, `AgentAnalytics`, `ResourceInventory`, and `Calendar` mapped to those Delta
entities.

If you create the model manually, rename the five tables as follows:

| Lakehouse table | Model table |
|---|---|
| `gold_cost_summary` | `CostSummary` |
| `gold_operational_metrics` | `OperationalMetrics` |
| `gold_agent_analytics` | `AgentAnalytics` |
| `dim_resource` | `ResourceInventory` |
| `dim_date` | `Calendar` |

Create these active one-to-many (`1:*`) relationships with single-direction filtering from each
dimension to its fact table:

- `Calendar[Date]` → `CostSummary[period_start]`
- `Calendar[Date]` → `OperationalMetrics[metric_date]`
- `Calendar[Date]` → `AgentAnalytics[interaction_date]`
- `ResourceInventory[resource_id]` → `CostSummary[resource_id]`

Delete or deactivate conflicting auto-detected relationships. These relationships allow one date
slicer or one resource filter to control the related report visuals.

If you import the JSON definition, replace `your-fabric-sql-endpoint` and `your-lakehouse-name` in the
`DatabaseQuery` expression with the SQL analytics endpoint and Lakehouse database name from Challenge 3.

### 2. Define the key measures

Create the core measures called out in the Fabric Control Tower README:

- `TotalCost`
- `AvgMonthlyCost`
- `CostYTD`
- `CostMoMChange`
- `ErrorRate`
- `P95Latency`
- `Availability`
- `TotalConversations`
- `TotalTokens`
- `AvgResponseTime`

Add time intelligence so the report can show **YTD**, **MTD**, prior period, and rolling 30-day views.
Mark `Calendar` as the date table using the `Date` column — `CostYTD` and `CostMoMChange` rely on
`TOTALYTD` and `DATEADD`, which need a marked date table to resolve correctly.
The measures do not need to be fancy, but they must be correct and reusable across pages.

### 3. Build the Reliability page

Design this page around the question: **Which agents are healthy, and where are the errors?**

Include visuals that cover:

- Error rate trend by agent, service, or error type.
- P95/P99 latency trends and outliers.
- Availability scorecards.
- Pipeline health or latest Gold refresh status if your team captured it.

A coach should be able to point at one unhealthy agent or service and ask, "What changed?" Your page
should make the answer obvious.

### 4. Build the Cost page

Design this page around the question: **What is each service or Azure resource costing us?**

Include visuals that cover:

- Total cost by service, resource group, agent, or tag.
- Month-over-month trend and forecast.
- Run rate by team or use case where tags support it.
- Top cost drivers table.
- Average monthly cost and month-over-month change KPIs.

Make the page useful for a FinOps conversation: show where spend is, who owns it, and whether it is
getting better or worse.

### 5. Build the Performance page

Design this page around the question: **Are we meeting SLAs, and how much are we scaling?**

Include visuals that cover:

- Throughput by minute or hour.
- Prompt and completion token consumption.
- Conversation, interaction, and session volume.
- Response-time trends by model and topic.

Connect performance to reliability and cost. High traffic is good only if latency, errors, and spend
stay under control.

### 6. Confirm Direct Lake mode

Before you claim victory, prove the model is actually Direct Lake:

- Storage mode is **Direct Lake** for all five model tables, including `Calendar` and
  `ResourceInventory`, which bind to the physical dimensions.
- The report is not using an imported copy of the data.
- There is no scheduled data refresh required for the report to see newly written Delta rows.
- After a pipeline run updates Gold, the report reflects the latest data once the model schema is in
  sync.

## Success criteria

- [ ] A working Power BI Control Tower report answers **Reliability**, **Cost**, and **Performance** live
- [ ] The semantic model is confirmed as **Direct Lake** over the Gold Delta tables
- [ ] Relationships to the date and resource dimensions are present and filters work across pages
- [ ] Measures are correct for at least `TotalCost`, `ErrorRate`, `P95Latency`, `TotalConversations`, and `TotalTokens`
- [ ] Cross-filtering works: the shared date filter changes cost, reliability, and performance visuals; resource filters change cost and inventory visuals
- [ ] Your team can explain which Gold table powers each major page

> 🧭 **Checkpoint:** show your coach the report and answer the three business questions live, using
> slicers and cross-filtering instead of switching back to raw tables.

## Hints

<details>
<summary>Starting from the provided semantic model</summary>

Use the JSON model definition as your map:

[`resources/fabric-control-tower/src/setup/semantic_model.json`](../resources/fabric-control-tower/src/setup/semantic_model.json)

Look for:

- Gold table bindings for `gold_cost_summary`, `gold_operational_metrics`, and
  `gold_agent_analytics`, plus `dim_date` and `dim_resource`.
- `mode: "directLake"` partitions on the Gold-backed tables.
- Date relationships into the provided calendar/date table.
- Resource relationships into the resource inventory/dimension table.

If you build manually in Fabric, reproduce the same model shape rather than inventing a new schema.
</details>

<details>
<summary>DAX starter pack</summary>

The reference README lists the key measures. Adapt names only if your semantic model uses different
physical table names.

```DAX
TotalCost = SUM(CostSummary[monthly_cost])

AvgMonthlyCost =
AVERAGEX(
  VALUES(CostSummary[period_start]),
  [TotalCost]
)

CostYTD = TOTALYTD([TotalCost], Calendar[Date])

CostMoMChange =
VAR CurrentPeriodCost = [TotalCost]
VAR PriorPeriodCost =
  CALCULATE(
    [TotalCost],
    DATEADD(Calendar[Date], -1, MONTH)
  )
RETURN
  DIVIDE(CurrentPeriodCost - PriorPeriodCost, PriorPeriodCost)

ErrorRate =
DIVIDE(
  SUM(OperationalMetrics[error_count]),
  SUM(OperationalMetrics[total_events]),
  0
)

P95Latency = AVERAGE(OperationalMetrics[latency_p95_ms])

Availability = AVERAGE(OperationalMetrics[availability_pct])

TotalConversations = SUM(AgentAnalytics[conversation_count])

AvgResponseTime = AVERAGE(AgentAnalytics[avg_response_time_ms])

TotalTokens = SUM(AgentAnalytics[total_tokens])
```

These formulas use the physical column names exposed when you create the model manually. If you
imported the provided JSON model, its friendly model-column aliases are already reflected in the
measures defined on `CostSummary`, `OperationalMetrics`, and `AgentAnalytics`.
</details>

<details>
<summary>Testing cross-filtering</summary>

Use the shared date slicer and confirm all three pages respond. Then select a resource and confirm the
cost and inventory visuals respond:

- Cost cards and trend narrow to that selection.
- Error rate and latency visuals change.
- Conversation volume, token usage, and response time update for the selected date period.

If only one visual changes, check relationships, inactive relationships, or mismatched dimension keys.
</details>

<details>
<summary>Direct Lake sanity checks</summary>

In the semantic model settings or model view, confirm all five tables use **Direct Lake** storage mode.
`Calendar` binds to `dim_date`; `ResourceInventory` binds to `dim_resource`. Avoid unsupported
transformations or DAX patterns that force a fallback path. If the source schema changed after your
model was created, resync the model metadata.
</details>

## Resources

- [`resources/fabric-control-tower/README.md`](../resources/fabric-control-tower/README.md) — semantic model, measures, and report page guidance
- [`resources/fabric-control-tower/src/setup/semantic_model.json`](../resources/fabric-control-tower/src/setup/semantic_model.json) — provided semantic model definition
- [`docs/architecture.md`](../docs/architecture.md) — Gold tables, Core KPIs, and the three business questions
- [Direct Lake overview](https://learn.microsoft.com/fabric/get-started/direct-lake-overview)

---

⬅️ Previous: **[Challenge 4 — Refine the Signal](challenge-04-medallion-pipeline.md)**  
➡️ Next: **[Challenge 6 — Make It Operational](challenge-06-operationalize.md)**
