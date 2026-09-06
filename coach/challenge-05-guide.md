# Coach Guide — Challenge 5: Stand Up the Control Tower

> Attendee challenge: [`challenges/challenge-05-control-tower-dashboards.md`](../challenges/challenge-05-control-tower-dashboards.md)

## Snapshot

| | |
|---|---|
| **Est. time** | 2–2.5 h |
| **Difficulty** | ⭐⭐⭐ (300) |
| **They build** | Direct Lake semantic model plus Power BI pages for reliability, cost, and performance |
| **Key services** | Direct Lake semantic model, Power BI, DAX |

## Coaching objectives

This is the customer-facing payoff. Keep teams focused on the business questions, not dashboard
ornamentation:

1. **Reliability** — Which agents are healthy? Where are errors and latency spikes coming from?
2. **Cost** — What is each service or Azure resource costing?
3. **Performance** — Are we meeting SLAs, and how much traffic and token usage are we seeing?

Your job is to connect every visual back to one of those questions, then verify the semantic model is
trustworthy: correct relationships, correct DAX, and Direct Lake over the Challenge 4 Gold tables.

**What good looks like:** the team answers all three questions live from one report, slices by
agent/service/resource/date, and can explain which Gold table powers each answer.

## The reference path

1. **Start with populated Gold tables**
   - Confirm Challenge 4 produced the Gold data products listed in [`docs/architecture.md`](../docs/architecture.md):
     `gold_cost_summary`, `gold_operational_metrics`, `gold_agent_analytics`,
     `gold_resource_inventory`, `dim_date`, and `dim_resource`.
   - If either dimension is missing, run `05_semantic_model_dimensions.ipynb` after notebooks 03 and 04.
   - If using the provided JSON, note its display names: `CostSummary`, `OperationalMetrics`,
    `AgentAnalytics`, `ResourceInventory`, and `Calendar`.

2. **Create the Direct Lake semantic model**
   - Create a model from the Lakehouse Gold tables, or import/adapt:
     [`resources/fabric-control-tower/src/setup/semantic_model.json`](../resources/fabric-control-tower/src/setup/semantic_model.json).
   - For a manual model, rename the tables to `CostSummary`, `OperationalMetrics`,
     `AgentAnalytics`, `ResourceInventory`, and `Calendar`.
   - Create these active one-to-many (`1:*`) relationships with single-direction filtering from the
     dimensions:
     - `Calendar[Date]` to `CostSummary[period_start]`
     - `Calendar[Date]` to `OperationalMetrics[metric_date]`
     - `Calendar[Date]` to `AgentAnalytics[interaction_date]`
     - `ResourceInventory[resource_id]` to `CostSummary[resource_id]`
   - Delete or deactivate conflicting auto-detected relationships.
   - Mark `Calendar` as the date table using the `Date` column so `TOTALYTD` and `DATEADD` resolve
     correctly; the provided JSON already sets `dataCategory: "Time"` on the table.
   - Replace the `DatabaseQuery` placeholders with the Challenge 3 SQL analytics endpoint and
     Lakehouse database name before deploying the JSON definition.

3. **Author the key measures**
  Use these formulas when the model was created manually from the Lakehouse tables. The provided
  JSON uses friendly aliases for some physical columns but defines equivalent measures.

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

  Format cost measures as currency, `CostMoMChange` and `ErrorRate` as percentages, counts as whole
  numbers, and latency and response time as two-decimal numbers. `availability_pct` already stores
  percentage points, so format `Availability` with a literal `%` suffix (`0.00"%"`) rather than a
  true percentage format, which would multiply the value by 100.

4. **Build the three report pages**
   - **Reliability:** error rate trend by agent/error type, P95/P99 latency, availability, pipeline health.
   - **Cost:** cost by service/agent, MoM trend and forecast, run rate by team/use case, top cost drivers.
  - **Performance:** conversations, interactions, sessions, token consumption, and response time by model/topic.

5. **Verify Direct Lake**
   - All five model tables show storage mode = **Direct Lake**; `Calendar` and `ResourceInventory`
     bind to `dim_date` and `dim_resource`.
   - There is no imported data copy and no scheduled refresh dependency.
   - The report reads Delta directly after pipeline runs. If Gold schema changed, resync model metadata.

## Checkpoint verification

Have the team present the report as if leadership is in the room:

1. **Reliability:** "Which agent or service is least healthy right now, and why?"
2. **Cost:** "What is the biggest cost driver, and what is the cost per agent/request?"
3. **Performance:** "Are we meeting SLA expectations, and what is traffic/token usage doing?"

Then test the model:

- Confirm the shared date slicer updates all three pages, then verify resource filtering across cost
  and inventory visuals.
- Open the model view and show fact-to-date/resource relationships.
- Show storage mode = Direct Lake for Gold-backed tables.
- Inspect at least `TotalCost`, `ErrorRate`, `P95Latency`, `TotalConversations`, and `TotalTokens` DAX.

✅ Pass when the team answers the three questions live and the model is confirmed Direct Lake.

## Common pitfalls & fixes

| Pitfall | Fix |
|---|---|
| Semantic model not bound to Lakehouse **Gold** tables | Rebind to the Gold Delta entities from Challenge 4; do not build visuals directly on Bronze/Silver or scratch tables |
| Relationships missing → totals look right but slicers lie | Recreate fact-to-date and fact-to-resource relationships; test with a single date/resource selection |
| `dim_date` or `dim_resource` is missing | Run `05_semantic_model_dimensions.ipynb` after both Gold-producing notebooks finish |
| Direct Lake falls back to DirectQuery because of unsupported DAX/model behavior | Simplify the measure/model pattern; keep transformations in Gold or the dimension notebook, not in the semantic model |
| Measures reference wrong columns after importing/adapting the JSON | Compare table names in `semantic_model.json` with the team's Lakehouse schema and update DAX once, centrally |
| Power BI license/capacity needed to publish or share | Use the Fabric workspace assigned to capacity from Challenge 0; publish within that workspace |
| Gold data changed but the model appears stale | Direct Lake auto-reflects data rows, but schema changes may require model metadata re-sync |

## Talking points (mini-briefing)

- **Direct Lake = import-style performance with no copy and no refresh window.** The Delta table is the
  source of truth; Power BI is not another data silo.
- **One model, three audiences.** SREs get reliability, FinOps gets cost, product/AI teams get
  performance — all filtered from the same semantic layer.
- **This is the deliverable leadership asked for.** Everything before this challenge was plumbing;
  this is where the Control Tower becomes visible and defensible.
- **Correct measures beat pretty visuals.** A beautiful report with broken relationships is worse than
  a plain report that answers the question accurately.

## If they finish early

- Add a KPI scorecard page that rolls up reliability, cost, and performance targets.
- Add drill-through from a summary visual to an agent detail page.
- Add conditional formatting and alt text for executive readability and accessibility.
- Create a mobile layout for incident reviews on the go.
- Add bookmarks for "SRE view", "FinOps view", and "Leadership view".
- Add a tooltip page that explains the KPI definitions in business language.
- Add a lightweight usage note so report consumers know which slicers to use first.

## Reference assets

- [`resources/fabric-control-tower/README.md`](../resources/fabric-control-tower/README.md) — semantic model measures and suggested report pages
- [`resources/fabric-control-tower/src/setup/semantic_model.json`](../resources/fabric-control-tower/src/setup/semantic_model.json) — actual provided semantic model definition
- [`docs/architecture.md`](../docs/architecture.md) — Gold tables, Core KPIs, and Direct Lake role in the architecture
- [`challenges/challenge-04-medallion-pipeline.md`](../challenges/challenge-04-medallion-pipeline.md) — prerequisite Gold pipeline
- [`challenges/challenge-06-operationalize.md`](../challenges/challenge-06-operationalize.md) — next operationalization stretch

Bring this guide to the final showcase rehearsal; Challenge 5 is where the story either lands or
exposes model gaps that must be fixed before operationalization.
