# Challenge 0 — Mission Briefing & Environment Setup

> **Est. time:** 1–1.5 h · **Level:** 100 · **Roles:** Everyone

---

> **Mission log, Day 1.**
> The customer's AI agents are multiplying faster than anyone can track. Before you can build the
> Control Tower, you need a launchpad: access to the customer's cloud, the right tools on your
> machines, and a Microsoft Fabric capacity to build on. A control tower is only as good as the
> ground it's built on — so let's pour the foundation.

In this challenge your team gets fully provisioned and confirms every member can reach Azure **and**
Fabric. Don't skip the verification steps — a missing role or quota gap discovered now saves hours
later.

## Objectives

By the end of this challenge you will have:

- Confirmed Azure subscription access and the roles needed for the rest of the RVAS.
- Verified Azure AI Foundry model quota in a region that also supports Fabric.
- A working **Microsoft Fabric capacity** (trial or paid) and a **team workspace** on it.
- Local tooling installed and verified for every team member.
- Cloned this repository and oriented yourselves in the `resources/` toolbox.

## Prerequisites

- The shared [**Prerequisites & Environment Setup**](../docs/prerequisites.md) guide — skim it as a
  team now; it is the companion to this challenge.
- At least one Azure subscription and a Microsoft Entra account in the same tenant you'll use for
  Fabric.

## Your mission

### 1. Establish the beachhead (Azure)

- Every team member signs in: `az login`, and selects the target subscription.
- As a team, **confirm your roles** on the subscription/resource group: you need **Contributor**
  (deploy resources) and, ideally, **User Access Administrator**/Owner (so the IaC can create role
  assignments). Identify at least one person who has the rights to create role assignments.
- Confirm someone has **Cost Management Reader** at the billing scope (needed in Challenge 2).
- Register the resource providers you'll need so first deployments don't stall.

### 2. Confirm your firepower (Foundry model quota)

- Confirm access to **Azure AI Foundry / Azure OpenAI** and locate **quota** for `gpt-5-mini`, the
  model used by the reference workload.
- Pick a **region** that offers both the model and Microsoft Fabric, and agree on it as a team —
  you'll deploy everything there.

### 3. Raise the tower's platform (Fabric)

- Stand up a **Fabric capacity**: start the **60-day free trial** (recommended) or use a paid **F2+**
  capacity. Note the **capacity name/ID**.
- Create a **Fabric workspace** for your team and **assign it to the capacity**.
- Make sure each team member can open the workspace at
  [app.fabric.microsoft.com](https://app.fabric.microsoft.com).

### 4. Arm the team (tooling) & get the code

- Install and verify the local tools (`az`, `azd`, `python`, `node`, `docker`, `git`). Start Docker
  Desktop (or another compatible container runtime) and confirm its engine is running.
- Clone this repo and take a 5-minute tour of `resources/` — note where the agent workload, landing
  zone, and Fabric assets live. You'll come back to each.

### 5. Record your coordinates

Capture these somewhere your team can see them all event — you'll reuse them constantly:

- Subscription ID(s), chosen **region**, resource group name convention
- Foundry model + deployment name
- Fabric **capacity ID** and **workspace name/ID**

## Success criteria

You're ready to advance when:

- [ ] Every team member can `az login` and select the target subscription
- [ ] Roles confirmed: Contributor (+ someone with role-assignment rights), Cost Management Reader
- [ ] Foundry model quota confirmed for `gpt-5-mini` in your chosen region
- [ ] A Fabric capacity is active and you know its ID/name
- [ ] A team **Fabric workspace** exists, assigned to the capacity, reachable by all members
- [ ] Local tooling installed and verified (`az version`, `azd version`, `python --version`, `docker info`)
- [ ] Repo cloned; team has located the four `resources/` components
- [ ] Your "coordinates" (subscription, region, capacity, workspace) are written down

> 🧭 **Checkpoint:** show your coach that everyone can reach both the Azure portal **and** the Fabric
> workspace, and read back your coordinates.

## Hints

<details>
<summary>Registering resource providers</summary>

```bash
for p in Microsoft.App Microsoft.DocumentDB Microsoft.ApiManagement \
         Microsoft.CognitiveServices Microsoft.OperationalInsights Microsoft.Storage; do
  az provider register --namespace "$p"
done
# Check status
az provider show -n Microsoft.App --query registrationState -o tsv
```
</details>

<details>
<summary>Checking your roles & subscription</summary>

```bash
az account show -o table
az role assignment list --assignee "$(az account show --query user.name -o tsv)" \
  --all --query "[].roleDefinitionName" -o tsv | sort -u
```
</details>

<details>
<summary>Starting the Fabric trial / creating a workspace</summary>

- Trial: [app.fabric.microsoft.com](https://app.fabric.microsoft.com) → **Account manager** (top-right)
  → **Start trial**. You become the capacity admin and can share it.
- Workspace: **Workspaces → New workspace** → under **Advanced**, set **License mode** to **Trial**
  (or **Fabric capacity** and pick your F-SKU).
- Docs: [Try Microsoft Fabric for free](https://learn.microsoft.com/fabric/fundamentals/fabric-trial).
</details>

<details>
<summary>Checking Foundry / OpenAI quota</summary>

In the **Azure AI Foundry portal → Management → Quotas**, filter to your region and confirm available
TPM for `gpt-5-mini`. The reference deployment requests 30K TPM; confirm that capacity is available
in the team's chosen region.
</details>

## Resources

- [`docs/prerequisites.md`](../docs/prerequisites.md) — the detailed companion checklist
- [`docs/architecture.md`](../docs/architecture.md) — the picture you're about to build
- [`resources/README.md`](../resources/README.md) — tour of the provided assets

---

➡️ Next: **[Challenge 1 — Light Up the Agents](challenge-01-agent-telemetry.md)**
