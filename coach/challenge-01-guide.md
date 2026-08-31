# Coach Guide — Challenge 1: Light Up the Agents

> Attendee challenge: [`challenges/challenge-01-agent-telemetry.md`](../challenges/challenge-01-agent-telemetry.md)

## Snapshot

| | |
|---|---|
| **Est. time** | 1.5–2 h |
| **Difficulty** | ⭐⭐ (200) |
| **They build** | A live Foundry agent workload emitting traces, metrics, and conversation data |
| **Key services** | Container Apps, API Management, Cosmos DB, Azure AI Foundry, Application Insights |

## Coaching objectives

The point is **not** "deploy an app" — it's understanding **what telemetry the Control Tower will
later consume and why**. Make sure teams can trace a single user message across every hop and can
name the custom token/cost metric. That mental model pays off in Challenges 4 and 5.

**What good looks like:** the team shows an end-to-end transaction (backend → agent → model +
Cosmos), points at a token metric, and finds their conversations in Cosmos DB. APIM is provisioned,
but it is not in the reference application's active request path.

## The reference path

```bash
cd resources/agent-workload
azd auth login
azd up        # env name, region (same as Challenge 0), subscription
```

- The reference deployment uses `gpt-5-mini` version `2025-08-07` with the `GlobalStandard` SKU.
- `azd up` provisions Container Apps env + 3 apps, APIM, Cosmos DB (serverless), Azure AI Services +
  model deployment, Log Analytics + Application Insights, and managed identities with role
  assignments. Expect **10–20 min**.
- Outputs include the **frontend/backend/agent URLs**.

On networks that block package downloads from Docker containers, `azd up` can fail during local
packaging. Keep Docker running for the `azd` prerequisite check, then use this fallback:

```bash
azd provision
ACR=$(az acr list -g "$AZURE_RESOURCE_GROUP" --query '[0].name' -o tsv)
LOGIN_SERVER=$(az acr show -n "$ACR" --query loginServer -o tsv)
TAG="deploy-$(date +%Y%m%d%H%M)"

az acr build -r "$ACR" -t "agent:$TAG" -f src/agent/Dockerfile src/agent
az acr build -r "$ACR" -t "backend:$TAG" -f src/backend/Dockerfile src/backend
az acr build -r "$ACR" -t "frontend:$TAG" -f src/frontend/Dockerfile src/frontend

az containerapp update -g "$AZURE_RESOURCE_GROUP" -n "$AZURE_ENV_NAME-agent" --image "$LOGIN_SERVER/agent:$TAG"
az containerapp update -g "$AZURE_RESOURCE_GROUP" -n "$AZURE_ENV_NAME-backend" --image "$LOGIN_SERVER/backend:$TAG"
az containerapp update -g "$AZURE_RESOURCE_GROUP" -n "$AZURE_ENV_NAME-frontend" --image "$LOGIN_SERVER/frontend:$TAG"
```

The frontend build can print an `npm ci` `EUSAGE` error because the repository has no
`package-lock.json`. This is expected: the Dockerfile uses `npm ci || npm install`, so the build
continues with `npm install`. Treat it as non-blocking only when the ACR run ends in `Succeeded`.

Generate traffic:

```bash
# Through the UI (preferred for the narrative), or burst the API:
AGENT=https://<agent-url>
for i in $(seq 1 20); do
  curl -s -X POST "$AGENT/api/agent/invoke" -H 'Content-Type: application/json' \
    -d '{"messages":[{"role":"user","content":"One fact about distributed tracing."}]}' >/dev/null
done
```

Show telemetry in **Application Insights** (this workload's resource):

- **Transaction search** → recent `POST /api/...` → **end-to-end transaction details** → waterfall
  across services + Cosmos DB + Azure OpenAI.
- **Application map** → services + dependencies, with latency/volume on hover.
- **Metrics / Logs** → custom token metrics:
  ```kql
  customMetrics
  | where name startswith "agent."
  | summarize sum(value) by name, bin(timestamp, 5m)
  | render timechart
  ```

Show **Cosmos DB → Data Explorer** → `agentsdb` → `conversations` / `interactions`; note the
partition key (`conversation_id`). This is the data mirrored in Challenge 3.

## Checkpoint verification

Have the team walk you through **one** message:

1. The request in **Transaction search** with the backend → agent → model/Cosmos waterfall.
2. The **Application Map** dependencies.
3. A **custom token/cost metric** plotted or queried.
4. The matching **conversation** document in Cosmos DB.

✅ Pass when all four are shown and they've recorded the App Insights + Cosmos resource names.

## Common pitfalls & fixes

| Pitfall | Fix |
|---|---|
| `azd up` fails creating **role assignments** | Deployer lacks User Access Administrator/Owner — grant it, or pre-create assignments (link from Challenge 0) |
| Agent returns **500 / auth error** to the model | Managed identity `Cognitive Services OpenAI User` role still propagating — wait 5–10 min, retry; verify `AZURE_OPENAI_ENDPOINT`/deployment env |
| **Quota or model deployment failure** | Confirm `gpt-5-mini` version `2025-08-07` and `GlobalStandard` availability in the chosen region, or select another supported region/version |
| `azd up` fails while downloading packages in Docker | Use the remote ACR build path above; this is an environment/network failure, not an infrastructure-template failure |
| Frontend ACR build prints `npm ci` `EUSAGE` | Expected without `package-lock.json`; verify the fallback `npm install` succeeds and the ACR run reports `Succeeded` |
| **No telemetry** in App Insights | `APPLICATIONINSIGHTS_CONNECTION_STRING` not set on the app, or no traffic yet — redeploy/restart and generate requests |
| Cosmos **403** from backend | Cosmos DB data-plane role assignment missing/propagating; check managed identity client id env |
| Can't find custom metrics | They live under a **custom metric namespace**; query `customMetrics` in Logs to confirm names (`agent.tokens.*`, `agent.duration_ms`) |

## Talking points (mini-briefing)

- **Every active service hop is observable.** Distributed tracing connects backend → agent → model
  and Cosmos so you can attribute latency and errors precisely. APIM integration remains a future
  hardening opportunity.
- **Managed identity everywhere** — no secrets; auth is Entra + RBAC. This is also how Fabric will
  reach the data later.
- **Tokens = money.** The custom token metric is the seed of cost-per-request and FinOps chargeback
  in Challenges 4–6. Connect today's metric to that future payoff.
- **Serverless Cosmos DB** is the conversation system-of-record — and the Mirroring source in
  Challenge 3.

## If they finish early

- Script sustained load and watch **Container Apps autoscale** (Scale and replicas).
- Explore **APIM Analytics** (rate limiting, PTU-aware load balancing) as future Control Tower input.
- Read the [`observability-sdk`](../resources/observability-sdk/) and map its event schema
  (AgentStart/Step/ExternalCall/End/Error) to what they see in App Insights.

## Reference assets

- [`resources/agent-workload/README.md`](../resources/agent-workload/README.md) — full service/API/monitoring detail
- [`resources/agent-workload/infra/`](../resources/agent-workload/infra/) — Bicep modules
- [`resources/observability-sdk/`](../resources/observability-sdk/) — telemetry contract
