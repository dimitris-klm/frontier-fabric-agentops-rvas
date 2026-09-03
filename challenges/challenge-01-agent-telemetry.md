# Challenge 1 — Light Up the Agents

> **Est. time:** 1.5–2 h · **Level:** 200 · **Roles:** Cloud/Platform engineer, AI engineer

---

> **Mission log.**
> You can't monitor what doesn't exist yet. The Control Tower needs something to watch — a real,
> running agent that talks to a model, calls tools, stores conversations, and (crucially) **emits
> telemetry at every hop**. Today you bring the customer's agent workload online and prove the signal
> is flowing.

This is the **source** of everything the Control Tower will eventually correlate: traces, custom
token and latency metrics, and conversation records. Get it emitting cleanly and the rest of the platform
has something real to chew on.

## Objectives

By the end of this challenge you will have:

- Deployed a full-stack **Azure AI Foundry** agent workload to Azure.
- Generated real agent traffic through the frontend → backend → agent → model path.
- Confirmed **distributed traces** connect the backend, agent, model, and Cosmos DB operations in
  Application Insights.
- Found the **custom token and latency metrics** the agent emits.
- Seen conversations land in **Cosmos DB** (the data the Control Tower will later mirror).

## Prerequisites

- ✅ Challenge 0 complete — Azure access, region, and Foundry quota confirmed.
- The reference workload in [`resources/agent-workload/`](../resources/agent-workload/).

## The workload

The provided app has three Container Apps, backed by Cosmos DB and a Foundry model deployment, all
wired to Application Insights. API Management is provisioned for future gateway integration, but the
reference application currently calls the Container Apps directly:

```
User → Frontend (Next.js) → Backend (FastAPI) → Agent (FastAPI) → Azure AI Foundry
                                  │
                                  └→ Cosmos DB (conversations & interactions)
```

Application telemetry begins at the backend. The backend and agent are instrumented with the Azure
Monitor OpenTelemetry SDK, and the agent records custom metrics for token usage and latency. The
frontend provides the user experience but does not emit Application Insights telemetry in this
reference workload.

## Your mission

### 1. Deploy the workload

- Provision and deploy the agent stack to your chosen region using the provided infrastructure.
- Capture the output **service URLs** (frontend, backend, agent), the Application Insights and Cosmos
  DB resource names, and the Log Analytics workspace name and resource ID.

### 2. Make the agent work for its telemetry

- Open the frontend and **have a conversation** with the agent — send several different prompts so
  there's a variety of traffic. (Bonus: script a handful of requests to the agent API to generate
  volume.)
- Confirm the agent is actually calling the model and returning completions (not erroring).

### 3. Prove the signal is flowing

Using Application Insights for this workload, demonstrate **all** of the following:

- A **distributed trace** that starts at the backend and shows the request flowing through the agent
  to Azure OpenAI, alongside the correlated Cosmos DB operations.
- The **Application Map**, showing the backend and agent services plus their Cosmos DB and Azure
  OpenAI dependencies.
- The **custom metrics** the agent emits for **token consumption and latency** — and explain to
  a teammate what they'll be worth to the Control Tower later.

### 4. Confirm the data exhaust

- In Cosmos DB, find the **conversations** and **interactions** your traffic created. Note the
  database/container names and partition keys: `/sessionId` for `conversations` and
  `/conversationId` for `interactions`. Challenge 3 will mirror this into Fabric.

## Success criteria

- [ ] The agent workload is deployed and the frontend responds to prompts end-to-end
- [ ] You can show one correlated trace spanning backend → agent → model in App Insights
- [ ] The **Application Map** shows the backend and agent plus Cosmos DB and Azure OpenAI dependencies
- [ ] You can point to the custom token and latency metrics emitted by the agent
- [ ] Conversation/interaction documents are visible in **Cosmos DB**
- [ ] You've recorded the App Insights, Log Analytics, and Cosmos DB resource coordinates for later challenges

> 🧭 **Checkpoint:** walk your coach through a single user message and trace its journey across the
> telemetry — from the click to the model and back.

## Hints

<details>
<summary>Deploying with azd</summary>

```bash
cd resources/agent-workload
azd auth login
azd up      # pick your env name, region, and subscription when prompted
```
The reference deployment uses `gpt-5-mini`. After deployment, `azd` prints the service URLs.

`azd up` is the normal path when Docker can download packages from npm and PyPI. On a restricted
network, ask your coach for the remote-build path: provision with `azd provision`, build each image
as `latest` with `az acr build`, and attach it with a new Container Apps revision.
</details>

<details>
<summary>Generating a burst of traffic</summary>

```bash
AGENT=https://<agent-url>
for i in $(seq 1 20); do
  curl -s -X POST "$AGENT/api/agent/invoke" \
    -H 'Content-Type: application/json' \
    -d '{"messages":[{"role":"user","content":"Give me one fact about observability."}]}' \
    >/dev/null && echo "req $i ok"
done
```
</details>

<details>
<summary>Finding telemetry in Application Insights</summary>

- **Transaction search** → pick a recent backend `POST /api/...` → open **end-to-end transaction
  details** to see the backend, agent, Azure OpenAI, and Cosmos DB operations.
- **Application map** → hover the edges for latency/volume.
- **Logs (KQL)** → run these checks and confirm each returns recent rows:
  ```kql
  AppRequests
  | where TimeGenerated > ago(30m)
  | project TimeGenerated, AppRoleName, Name, OperationId, ResultCode, Success
  | order by TimeGenerated desc
  ```
  ```kql
  AppDependencies
  | where TimeGenerated > ago(30m)
  | project TimeGenerated, AppRoleName, Name, Target, OperationId, ResultCode, Success
  | order by TimeGenerated desc
  ```
  ```kql
  AppMetrics
  | where TimeGenerated > ago(30m) and Name startswith "agent."
  | summarize Value=sum(Sum) by Name, bin(TimeGenerated, 5m)
  | order by TimeGenerated desc
  ```
</details>

## Resources

- [`resources/agent-workload/README.md`](../resources/agent-workload/README.md) — services, APIs, env vars, monitoring
- [Azure Monitor OpenTelemetry](https://learn.microsoft.com/azure/azure-monitor/app/opentelemetry-enable)

---

➡️ Next: **[Challenge 2 — Build the Telemetry Landing Zone](challenge-02-landing-zone.md)**
