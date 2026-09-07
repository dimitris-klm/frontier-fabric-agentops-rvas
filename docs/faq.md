# Frequently Asked Questions

General, architecture, and logistics questions for the **AgentOps Control Tower** RVAS. Coaches
should also review the per-challenge guides in [`coach/`](../coach/README.md).

---

## Logistics

**How long is the RVAS?**
Plan for **1.5–2 days**. Challenges 0–5 are the core path; Challenge 6 is a stretch for teams that
move fast. Each challenge is scoped to roughly 1.5–2.5 hours including discussion.

**Do we build everything from scratch?**
No. The [`resources/`](../resources/) directory is a complete reference implementation — Bicep,
application code, Fabric setup scripts, PySpark notebooks, pipelines, and a semantic model. The
intent is that you **deploy the Azure foundation** (Challenges 1–2) quickly and spend your real
energy on the **Fabric Control Tower** (Challenges 3–6). Coaches decide how much of the reference to
reveal based on your team's level.

**Can teams share one Fabric capacity?**
Yes. One **trial capacity** (or paid F-SKU) can back many workspaces. The capacity admin assigns
each team's workspace to the shared capacity. Give each team **its own workspace** for isolation.

**What if our network blocks egress?**
Flag it before Day 1. You need outbound HTTPS to Azure, `*.fabric.microsoft.com`, and package
registries (PyPI, npm, MCR/Docker Hub). Azure Cloud Shell is a good fallback for CLI work.

---

## Environment & access

**Do we need multiple Azure subscriptions?**
One is enough. Multiple is fully supported and realistic — e.g., workload in one subscription, cost
exports scoped at the billing account. Record your subscription IDs in Challenge 0.

**Which region should we use?**
One that offers **both** the reference model (`gpt-5-mini`) **and** Microsoft Fabric. East
US 2, West US 3, and Sweden Central are safe defaults. Keep all resources in one region to avoid
egress charges with OneLake shortcuts.

**What happens when the Fabric trial expires?**
After 60 days, trial-capacity access is revoked and assigned workspaces are reassigned. Content stays
in **OneLake for 7 days** and can be reactivated by assigning the workspace to a paid F or Power BI
Premium capacity. For a 2-day event this is a non-issue — just don't let a long gap pass before
revisiting.

**Do we need Power BI Desktop?**
No — you can author the semantic model and reports in the Fabric/Power BI service. Desktop (Windows)
is convenient for offline model edits but optional.

---

## Architecture & design

**Why a medallion (Bronze/Silver/Gold) architecture instead of one transformation?**
Separation of concerns. **Bronze** preserves raw data for reprocessing and audit. **Silver**
standardizes across sources so consumers get a consistent interface. **Gold** pre-computes
aggregations so dashboards are fast. If a transformation bug appears, reprocess from Bronze without
re-ingesting from source.

**Why Fabric instead of Synapse or Databricks?**
Fabric unifies data engineering, warehousing, and BI on a shared **OneLake**. For this scenario the
tight integration between Lakehouse, notebooks, pipelines, Direct Lake, and Data Activator removes
data movement and simplifies the architecture. Synapse and Databricks are great alternatives for the
medallion layer — the pattern is portable.

**Why OneLake shortcuts and Mirroring instead of copying data in?**
**Shortcuts** let Fabric read ADLS Gen2 telemetry in place — zero duplication, zero intra-region
egress. **Mirroring** replicates Cosmos DB conversations into OneLake Delta tables near-real-time
with no ETL to build or operate. Together they minimize cost, latency, and maintenance.

**What makes this a "Control Tower" and not just a dashboard?**
It **correlates** signals that normally live in silos — cost (Cost Management), reliability (Azure
Monitor), and agent behavior (App Insights + Cosmos DB) — into shared Gold data products, and then
**acts** on them with real-time alerts. One pane of glass plus automated response.

**How does cost attribution / chargeback work?**
The Silver/Gold layers join FOCUS cost data with **resource tags** and the **agent namespace**
(`<org>.<domain>.<agent>.<version>`). That lets you attribute blended cost (model tokens + Cosmos RUs
+ compute + APIM) to a team, use case, or client. Challenge 6 builds this out with RLS.

---

## Performance & scale

**How much data can this handle?**
It scales with Fabric capacity. F2/F4 handles tens of millions of rows comfortably for the
RVAS. For enterprise volumes (billions of cost records), use F64+, partition Delta tables by
month, and Z-order on frequently filtered columns (subscription, date).

**What's the end-to-end latency?**
ADLS Gen2 data follows the pipeline schedule (the reference daily pipeline runs ~06:00 UTC). Cosmos
DB mirrored data is typically available within a minute of the write. Direct Lake reflects the
latest Delta state after each pipeline run — no scheduled dataset refresh needed.

**How long does the end-to-end pipeline take?**
For a typical 3-month window (a few million cost rows, hundreds of thousands of metric points, tens
of thousands of logs), the full Bronze→Gold pipeline runs in ~10–15 min on F2; the daily incremental
finishes in 2–3 min.

---

## Security & cost

**How is authentication handled?**
Managed identities and Entra ID throughout — the agent services use managed identity to reach Azure
OpenAI and Cosmos DB; Fabric uses workspace identity / managed identity to reach ADLS Gen2; Mirroring
authenticates via Entra ID. Optional CI/CD uses GitHub OIDC federated credentials (no stored
secrets).

**Is the data encrypted?**
Yes. ADLS Gen2 and OneLake encrypt at rest (Microsoft-managed keys by default; customer-managed keys
available). Cosmos DB is encrypted at rest. All traffic uses TLS 1.2+.

**What will this cost us?**
Low for an RVAS: Fabric is free on trial; the agent workload runs a few dollars/day with
`gpt-5-mini`, serverless Cosmos DB, and scale-to-low Container Apps (APIM Developer tier is the main
fixed cost); the landing zone is inexpensive. **Tear everything down** with `azd down --purge` and
end the Fabric trial / delete the workspace when finished.

**Can we pause Fabric to save money?**
Yes (paid capacities). Pause outside working hours; schedule pipelines within the active window.
OneLake data persists while paused. Trial capacity needs no pausing — it's free.

---

## Troubleshooting quick hits

| Symptom | First thing to check |
|---|---|
| `azd up` fails on role assignment | You lack **User Access Administrator**/Owner; ask an admin or pre-create the identity |
| Agent returns 500 / auth error | Managed identity role on Azure OpenAI (`Cognitive Services OpenAI User`) and Cosmos DB data role not yet propagated — wait a few minutes |
| No telemetry in App Insights | `APPLICATIONINSIGHTS_CONNECTION_STRING` not set on the container app; generate some traffic first |
| Shortcut creation fails in Fabric | Workspace identity lacks **Storage Blob Data Reader** on the storage account; Mirroring/SP tenant setting disabled |
| Mirrored Cosmos tables empty | Continuous backup / analytical store not enabled on the Cosmos account; check Mirroring status timestamp |
| Power BI report is blank | Gold tables not populated (run the pipeline) or semantic model not refreshed/bound to the Lakehouse |
| Cost container empty | Cost Management export not run yet (it's daily); trigger it manually or wait |

More detail lives in each challenge's **coach guide**.
