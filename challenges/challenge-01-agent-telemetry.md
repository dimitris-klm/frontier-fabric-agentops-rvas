# Challenge 1 — Light Up the Agents

> **Est. time:** 1.5–2 h · **Level:** 200 · **Roles:** Cloud/Platform engineer, AI engineer

---

> **Mission log.**
> You can't monitor what doesn't exist yet. The Control Tower needs something to watch — a real,
> running agent that talks to a model, calls tools, stores conversations, and (crucially) **emits
> telemetry at every hop**. Today you bring the customer's agent workload online and prove the signal
> is flowing.

This is the **source** of everything the Control Tower will eventually correlate: traces, custom
token/cost metrics, and conversation records. Get it emitting cleanly and the rest of the platform
has something real to chew on.

## Objectives

By the end of this challenge you will have:

- Deployed a full-stack **Azure AI Foundry** agent workload to Azure.
- Generated real agent traffic through the frontend → backend → agent → model path.
- Confirmed **distributed traces** connect every hop in Application Insights.
- Found the **custom token/cost metrics** the agent emits.
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

Everything is instrumented with the Azure Monitor OpenTelemetry SDK, and the agent records custom
metrics for token usage and latency.

## Your mission

### 1. Deploy the workload

- Provision and deploy the agent stack to your chosen region using the provided infrastructure.
- Capture the output **service URLs** (frontend, backend, agent) and the names of the Application
  Insights and Cosmos DB resources.

### 2. Make the agent work for its telemetry

- Open the frontend and **have a conversation** with the agent — send several different prompts so
  there's a variety of traffic. (Bonus: script a handful of requests to the agent API to generate
  volume.)
- Confirm the agent is actually calling the model and returning completions (not erroring).

### 3. Prove the signal is flowing

Using Application Insights for this workload, demonstrate **all** of the following:

- A **distributed trace** (end-to-end transaction) that shows the request flowing across the
  services and out to the model and Cosmos DB.
- The **Application Map**, showing the services and their dependencies (Cosmos DB, Azure OpenAI).
- The **custom metrics** the agent emits for **token consumption** (and/or latency) — and explain to
  a teammate what they'll be worth to the Control Tower later.

### 4. Confirm the data exhaust

- In Cosmos DB, find the **conversations** and **interactions** your traffic created. Note the
  database/container names and the partition key — Challenge 3 will mirror this into Fabric.

## Success criteria

- [ ] The agent workload is deployed and the frontend responds to prompts end-to-end
- [ ] You can show one **end-to-end trace** spanning backend → agent → model in App Insights
- [ ] The **Application Map** shows the services plus Cosmos DB and Azure OpenAI as dependencies
- [ ] You can point to a **custom token/cost metric** emitted by the agent
- [ ] Conversation/interaction documents are visible in **Cosmos DB**
- [ ] You've recorded the App Insights + Cosmos DB resource names for later challenges

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
with `az acr build`, and attach the resulting images with `az containerapp update`.
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

- **Transaction search** → pick a recent `POST /api/...` → open **end-to-end transaction details**
  to see the waterfall across services, Cosmos DB, and Azure OpenAI.
- **Application map** → hover the edges for latency/volume.
- **Metrics** → choose the custom metric namespace and plot `agent.tokens.completion` (or similar).
- **Logs (KQL)** to confirm token flow:
  ```kql
  customMetrics
  | where name startswith "agent."
  | summarize sum(value) by name, bin(timestamp, 5m)
  ```
</details>

<details>
<summary>Where's the telemetry contract?</summary>

The shared [`resources/observability-sdk/`](../resources/observability-sdk/) defines the event and
metric schema (AgentStart/Step/ExternalCall/End/Error, token & cost metrics). Skim its README to
understand what the agent *should* be emitting and why it matters for cost attribution later.
</details>

## Resources

- [`resources/agent-workload/README.md`](../resources/agent-workload/README.md) — services, APIs, env vars, monitoring
- [`resources/observability-sdk/README.md`](../resources/observability-sdk/README.md) — the telemetry contract
- [Azure Monitor OpenTelemetry](https://learn.microsoft.com/azure/azure-monitor/app/opentelemetry-enable)

---

➡️ Next: **[Challenge 2 — Build the Telemetry Landing Zone](challenge-02-landing-zone.md)**
