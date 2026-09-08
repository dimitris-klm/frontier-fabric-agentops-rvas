# Coach Handbook

Everything an instructor needs to run the **AgentOps Control Tower** RVAS. Read this first, then
review the per-challenge coach guides.

> 🧑‍🏫 **Coaching philosophy:** facilitate, don't solve. Let teams struggle productively. Ask
> leading questions, point to the right doc, and reveal the reference solution only when a team is
> genuinely stuck or running out of time. The `resources/` directory is the full answer key — you
> decide how much to expose and when.

---

## Who this is for

- **Audience:** platform/cloud engineers, data engineers, FinOps practitioners, and AI engineers at
  the customer. Level 200–400.
- **Team size:** 3–5 people. Aim for a mix of skills per team so each challenge has an owner.
- **Coach ratio:** 1 coach per 1–3 teams works well.

## What teams build

A Fabric-based control tower that ingests and correlates telemetry from Azure services and
Foundry-built agents, delivering dashboards and alerts for **reliability, cost, and performance**.
See [`docs/architecture.md`](../docs/architecture.md). The reference implementation lives in
[`resources/`](../resources/).

## Sample agenda (2 days)

| Time | Day 1 | Day 2 |
|---|---|---|
| Morning | Welcome + mission briefing (30 min) · **Challenge 0** · **Challenge 1** | Recap · **Challenge 4** |
| Afternoon | **Challenge 2** · start **Challenge 3** | **Challenge 5** · **Challenge 6** (stretch) · Showcase + retro |

Compressed to **1.5 days?** Pre-provision Challenge 0 prerequisites, run Challenges 1 & 2 in parallel
(split teams), and treat Challenge 6 as optional.

> ⏱️ The biggest schedule risk is **environment access** (roles, quota, Fabric enablement). Drive the
> [prerequisites](../docs/prerequisites.md) **before** Day 1. Have a backup subscription and a
> pre-started Fabric trial in your pocket.

## How to run each challenge

1. **Frame it (5–10 min).** Set the scene with the challenge's mission hook and objectives. Use the
   "Talking points" in each coach guide as mini-lecture material.
2. **Let them work.** Teams self-organize. Circulate, unblock, ask questions. Resist hand-holding.
3. **Checkpoint (✅).** Validate against the success criteria using the "Checkpoint verification" in
   the coach guide. Award points if you're scoring.
4. **Debrief (5 min).** Reinforce *why* it mattered before moving on.

## Reveal policy for `resources/`

| Team is… | Do this |
|---|---|
| Cruising | Keep the reference hidden; push them toward stretch goals and "explain it to me" |
| Steady | Point to the relevant **resource README**, not the solution commands |
| Stuck (15+ min) | Share the specific command/snippet from the coach guide |
| Out of time | Have them deploy the reference asset directly so they can continue the arc |

The arc matters more than any single challenge — **don't let a team fall off the path.** It's fine to
fast-forward a team through Challenges 1–2 (Azure foundation) so they reach the **Fabric** core
(3–6), which is the point of the event.

## Per-challenge guides

| # | Guide | Focus |
|---|---|---|
| 0 | [challenge-00-guide.md](challenge-00-guide.md) | Access, tooling, Fabric capacity |
| 1 | [challenge-01-guide.md](challenge-01-guide.md) | Deploy + verify agent telemetry |
| 2 | [challenge-02-guide.md](challenge-02-guide.md) | ADLS Gen2 landing zone |
| 3 | [challenge-03-guide.md](challenge-03-guide.md) | Lakehouse, shortcuts, Mirroring |
| 4 | [challenge-04-guide.md](challenge-04-guide.md) | Medallion pipeline |
| 5 | [challenge-05-guide.md](challenge-05-guide.md) | Semantic model + dashboards |
| 6 | [challenge-06-guide.md](challenge-06-guide.md) | Alerts, chargeback, RLS |

## Logistics

- **Shared Fabric capacity.** One trial/paid capacity can back every team. As capacity admin, assign
  each team's workspace to it. Give each team **its own workspace**.
- **Naming.** Agree a convention up front, e.g. `rg-agentops-<team>` and workspace `AgentOps-<team>`,
  so resources are easy to find and clean up.
- **Cost.** Low by design (see [FAQ](../docs/faq.md)). The reference deployment uses `gpt-5-mini`.
  Pause paid capacity overnight.
- **Cleanup (end of event).** In each workload dir: `azd down --purge`. Delete Fabric workspaces and,
  if you started a trial, let it expire (or end it). Remove cost exports.

## Scoring (optional)

The rubric lives in [`challenges/README.md`](../challenges/README.md#scoring). For a closing
**showcase**, have each team demo their Control Tower answering the three business questions
(reliability, cost, performance). Judge on **correlation and usefulness**, not pixel polish.

## Facilitation tips

- Keep the **three business questions** on a whiteboard all event. Every challenge ladders up to them.
- Celebrate the first end-to-end **trace** (Challenge 1) and the first **Direct Lake** visual
  (Challenge 5) — they're the "aha" moments.
- If energy dips in the data-engineering middle (Challenge 4), remind teams the payoff is the
  dashboard two hours away.
