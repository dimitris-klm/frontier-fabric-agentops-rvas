# Coach Guide — Challenge 0: Mission Briefing & Environment Setup

> Attendee challenge: [`challenges/challenge-00-mission-setup.md`](../challenges/challenge-00-mission-setup.md)

## Snapshot

| | |
|---|---|
| **Est. time** | 1–1.5 h |
| **Difficulty** | ⭐ (100) — but the highest-risk for delays |
| **They build** | Working access to Azure + Fabric, tooling, a team workspace |
| **Key services** | Azure RBAC, Azure AI Foundry quota, Microsoft Fabric capacity/workspace |

## Coaching objectives

This challenge is about **removing blockers before they cost you Day 2**. Your goal is that every
team member can reach **both** Azure and Fabric, and that the team has captured their "coordinates."
Treat it as a readiness gate, not a learning exercise.

**What good looks like:** every member runs `az login` and opens the team's Fabric workspace; the
team can recite their subscription, region, capacity, and workspace from their notes.

## The reference path

Most of this is verification. Drive it briskly.

1. **Azure access**
   ```bash
   az login
   az account set --subscription "<sub-id>"
   az account show -o table
   ```
   Confirm roles include **Contributor**; at least one member needs role-assignment rights
   (**User Access Administrator**/Owner) for Challenges 1–2 Bicep.

2. **Resource providers** (prevents first-deploy stalls)
   ```bash
   for p in Microsoft.App Microsoft.DocumentDB Microsoft.ApiManagement \
            Microsoft.CognitiveServices Microsoft.OperationalInsights Microsoft.Storage; do
     az provider register --namespace "$p"
   done
   ```

3. **Foundry quota** — in the **Azure AI Foundry portal → Quotas**, confirm at least 30K TPM for
   `gpt-5-mini` in the chosen region. Lock in one region for the whole team.

4. **Fabric capacity + workspace**
   - Trial: [app.fabric.microsoft.com](https://app.fabric.microsoft.com) → Account manager → **Start
     trial**. The starter becomes capacity admin.
   - Create a workspace per team; set License mode to **Trial** (or **Fabric capacity** + F-SKU).
   - Share the capacity by assigning each team's workspace to it.

5. **Tooling** — verify on each machine, including a running Docker engine:
   ```bash
   az version && azd version && python --version && node --version && docker info && git --version
   ```

6. **Clone + tour** `resources/`.

## Checkpoint verification

Ask the team to:

- Run `az account show` on two different members' machines.
- Open the **team Fabric workspace** in a browser.
- Read back their **coordinates** (sub IDs, region, capacity ID, workspace name).

✅ Pass when all members have Azure + Fabric access and the coordinates are written down.

## Common pitfalls & fixes

| Pitfall | Fix |
|---|---|
| No **User Access Administrator** → Challenge 1 role assignments will fail | Identify it now. Ask an admin to grant it, or plan to pre-create the managed identity & assignments for that team |
| **Foundry access not enabled** on the subscription | This can take time — escalate immediately; have a backup subscription that already has Foundry |
| Region has the model but **not Fabric** (or vice versa) | Standardize on East US 2 / West US 3 / Sweden Central |
| Fabric **tenant setting** disabled (can't create workspaces / Mirroring) | Get the Fabric admin to enable it (see prerequisites) — this is a tenant-admin action, plan ahead |
| Trial **F64 option not offered** | F4 is fine for the RVAS; or use a paid F2+; eligibility for F64 varies |
| Corporate **egress restrictions** block PyPI/npm/MCR or `*.fabric.microsoft.com` | Use Azure Cloud Shell for CLI; raise a firewall exception |
| `azd provision` says the container runtime is not running | Start Docker Desktop and wait for `docker info` to succeed. With the current `azure.yaml`, `azd` checks Docker even when running only the provisioning phase |

## Talking points (mini-briefing)

- This is the customer's **own environment** — what they build here is reusable Monday morning.
- Preview the destination: show [`docs/architecture.md`](../docs/architecture.md) and the three
  business questions (reliability, cost, performance). Put them on the board.
- Emphasize **same-tenant** alignment of subscription + Fabric to avoid identity pain later.

## If they finish early

- Have them **pre-read** Challenge 1 and 2 and split ownership.
- Set up a shared **naming convention** and a scratchpad for coordinates.
- Skim the [`observability-sdk`](../resources/observability-sdk/) README to prime Challenge 1.

## Reference assets

- [`docs/prerequisites.md`](../docs/prerequisites.md), [`docs/architecture.md`](../docs/architecture.md)
- [`resources/README.md`](../resources/README.md)
