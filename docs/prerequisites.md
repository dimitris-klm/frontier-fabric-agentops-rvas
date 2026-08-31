# Prerequisites & Environment Setup

Work through this checklist **with your coach before Day 1**. The RVAS runs on the **customer's
own environment** — your Azure subscription(s) plus a Microsoft Fabric capacity. Getting access and
quota sorted up front is the single biggest factor in a smooth event.

> ⏱️ **Lead time:** Azure AI Foundry model quota and Fabric tenant enablement can take from minutes
> to a few business days depending on your tenant's governance. **Start at least 3–5 business days
> early.**

---

## 1. Azure subscription & permissions

You need at least one Azure subscription where your team can create resources.

| Requirement | Why | How to check |
|---|---|---|
| **Contributor** (or Owner) on a subscription or resource group | Deploy the agent workload and landing zone | `az role assignment list --assignee <you> -o table` |
| **User Access Administrator** or **Owner** (recommended) | Create role assignments for managed identities | Needed by the Bicep in Challenges 1 & 2 |
| **Cost Management Reader** at the billing scope | Configure FOCUS cost exports (Challenge 2) | Ask your billing admin |
| Ability to **register resource providers** | First-time use of Container Apps, APIM, etc. | `az provider register --namespace Microsoft.App` |

> 🏢 **Multiple subscriptions?** That's fine and realistic. A common pattern: the **agent workload**
> and **landing zone** live in one subscription, while **cost exports** are scoped at the billing
> account / management group. Note your subscription IDs in Challenge 0.

## 2. Azure AI Foundry / Azure OpenAI quota

The agent needs a chat model. Confirm **before** the event:

- Access to **Azure AI Foundry** (Azure OpenAI) in your tenant. If your subscription has never used
  it, request access / confirm it is enabled.
- **Model quota** for `gpt-5-mini`, the reference workload's default model, in your chosen region.
- A **region** that offers both the model and Microsoft Fabric. Good defaults: **East US 2**,
  **West US 3**, **Sweden Central**. Verify model availability for your region in the Foundry portal.

> 🔎 Check quota in the **Azure AI Foundry portal → Quotas**, or with the `azure-quotas` tooling.
> The reference deployment requests 30K TPM of `gpt-5-mini` per team.

## 3. Microsoft Fabric capacity

The Control Tower runs on **Microsoft Fabric**. You have two options:

### Option A — Fabric free trial (recommended for the RVAS)

- Provides **free access for 60 days** with a trial capacity (provisioned as an **F64** or **F4**;
  eligibility for F64 may vary by tenant). It includes a Power BI individual trial.
- The person who starts the trial becomes the **Capacity administrator** and can **share** it by
  assigning workspaces — one trial capacity can back every team's workspace.
- Start it from **[app.fabric.microsoft.com](https://app.fabric.microsoft.com)** → **Account
  manager → Start trial**. See [Try Microsoft Fabric for free](https://learn.microsoft.com/fabric/fundamentals/fabric-trial).

### Option B — Paid Fabric capacity

- Any **F2 or higher** capacity works. F2 handles the RVAS data volumes comfortably; the
  reference Q&A notes F64+ for production scale.
- Create it in the Azure portal (`Microsoft.Fabric/capacities`) and **pause it** outside working
  hours to control cost.

### Tenant settings (admin, one-time)

A **Fabric / Power BI tenant administrator** must ensure:

- **Microsoft Fabric is enabled** for the tenant (or for the relevant security group). See
  [Enable Microsoft Fabric](https://learn.microsoft.com/fabric/admin/fabric-switch).
- Users can **create workspaces**.
- For Challenge 3, the **Mirroring** and **service principal / managed identity** workspace settings
  are permitted (used by the setup script and Cosmos DB Mirroring).

> ⚠️ On **trial capacity**, Private Link is disabled and a few enterprise features aren't supported —
> none of which block this RVAS. Mirroring, shortcuts, Spark, Direct Lake, and Data Activator
> all work.

## 4. Power BI

- Each report author/consumer needs a **Power BI Pro** license, **Premium Per User**, or the
  **Power BI individual trial** that accompanies the Fabric trial.
- **Power BI Desktop** (Windows) is optional but handy for editing the semantic model offline.
  Authoring in the Fabric/Power BI service is sufficient for all challenges.

## 5. Identity & networking

- A **Microsoft Entra ID** account in the same tenant as the Azure subscription and Fabric capacity.
  Using the **same tenant** end-to-end avoids cross-tenant friction with managed identity and
  Mirroring.
- Outbound HTTPS to Azure, Fabric (`*.fabric.microsoft.com`), and package registries (PyPI, npm,
  Docker Hub / MCR). If the customer network restricts egress, flag it to your coach early.

## 6. Local tooling

Install on each team member's machine (or use a shared **Azure Cloud Shell** / dev box):

| Tool | Version | Install |
|---|---|---|
| **Azure CLI** (`az`) | 2.60+ | https://learn.microsoft.com/cli/azure/install-azure-cli |
| **Azure Developer CLI** (`azd`) | 1.10+ | `curl -fsSL https://aka.ms/install-azd.sh \| bash` |
| **Python** | 3.11+ | https://www.python.org/ (use a venv) |
| **Node.js** | 20+ | https://nodejs.org/ (frontend, local dev only) |
| **Docker** | latest | https://www.docker.com/products/docker-desktop/ (start the engine before running `azd`) |
| **Git** | latest | https://git-scm.com/ |
| **Power BI Desktop** *(optional)* | latest | https://aka.ms/pbidesktop (Windows only) |

Verify:

```bash
az version
azd version
python --version
node --version
docker info
git --version
```

## 7. Cost expectations & hygiene

This RVAS is intentionally low-cost, but **clean up when you're done**.

- **Fabric** — free on trial; pause paid capacity outside hours. OneLake storage is a few cents/GB.
- **Agent workload** — serverless Cosmos DB, Container Apps autoscaling, and `gpt-5-mini` keep
  spend to a few dollars/day. APIM **Developer** tier (used here) is the main fixed cost.
- **Landing zone** — ADLS Gen2 + Log Analytics are inexpensive at RVAS volumes.
- **Tear down** with `azd down --purge` in each workload directory when the event ends (Challenge 0
  cleanup notes), and delete the Fabric workspace / end the trial.

## 8. Get the code

```bash
git clone https://github.com/microsoft/frontier-fabric-agentops-rvas.git
cd frontier-fabric-agentops-rvas
```

---

## ✅ Pre-flight checklist

Bring this to the kickoff. You're ready when every box is ticked:

- [ ] Each member can `az login` to the target subscription
- [ ] Roles confirmed: Contributor (+ User Access Administrator), Cost Management Reader
- [ ] Resource providers registered: `Microsoft.App`, `Microsoft.DocumentDB`, `Microsoft.ApiManagement`, `Microsoft.CognitiveServices`, `Microsoft.OperationalInsights`, `Microsoft.Storage`
- [ ] Azure OpenAI / Foundry access confirmed with quota for `gpt-5-mini` in your region
- [ ] Region chosen that supports both the model **and** Fabric (e.g., East US 2)
- [ ] Fabric trial started (or paid F2+ capacity created) and you know your **capacity ID / name**
- [ ] Fabric tenant settings allow workspace creation + Mirroring
- [ ] Everyone has a Power BI license (Pro / PPU / trial)
- [ ] Local tooling installed and verified (`az`, `azd`, `python`, `docker`, `git`)
- [ ] Repo cloned

Stuck on any item? That's exactly what **[Challenge 0](../challenges/challenge-00-mission-setup.md)**
and your coach are for.
