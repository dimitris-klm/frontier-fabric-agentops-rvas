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
later consume and why**. Make sure teams can trace a single user message from the backend through
the agent and can name the custom token and latency metrics. That mental model pays off in later
challenges.

**What good looks like:** the team shows a correlated transaction (backend → agent → model, with
Cosmos operations), points at token and latency metrics, and finds their conversations in Cosmos DB.
Application telemetry begins at the backend; the frontend is not instrumented. APIM is provisioned,
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
- Outputs include the **frontend/backend/agent URLs** plus the Application Insights and Log Analytics
  workspace coordinates.

On networks that block package downloads from Docker containers, `azd up` can fail during local
packaging. Keep Docker running for the `azd` prerequisite check, then use this fallback:

```bash
azd provision
ACR=$(az acr list -g "$AZURE_RESOURCE_GROUP" --query '[0].name' -o tsv)
LOGIN_SERVER=$(az acr show -n "$ACR" --query loginServer -o tsv)
REVISION="r$(date +%Y%m%d%H%M%S)"

az acr build -r "$ACR" -t "agent:latest" -f src/agent/Dockerfile src/agent
az acr build -r "$ACR" -t "backend:latest" -f src/backend/Dockerfile src/backend
az acr build -r "$ACR" -t "frontend:latest" -f src/frontend/Dockerfile src/frontend

az containerapp update -g "$AZURE_RESOURCE_GROUP" -n "$AZURE_ENV_NAME-agent" --image "$LOGIN_SERVER/agent:latest" --revision-suffix "$REVISION"
az containerapp update -g "$AZURE_RESOURCE_GROUP" -n "$AZURE_ENV_NAME-backend" --image "$LOGIN_SERVER/backend:latest" --revision-suffix "$REVISION"
az containerapp update -g "$AZURE_RESOURCE_GROUP" -n "$AZURE_ENV_NAME-frontend" --image "$LOGIN_SERVER/frontend:latest" --revision-suffix "$REVISION"
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

Show telemetry in **Application Insights** (this workload's resource). Application telemetry begins
at the backend:

- **Transaction search** → recent backend `POST /api/...` → **end-to-end transaction details** →
  correlated backend, agent, Azure OpenAI, and Cosmos DB operations.
- **Application map** → backend and agent plus dependencies, with latency/volume on hover.
- **Logs** → verify requests, dependencies, and custom metrics independently:
  ```kql
  AppRequests
  | where TimeGenerated > ago(30m)
  | summarize Count=count() by AppRoleName, Name, ResultCode, Success
  ```
  ```kql
  AppDependencies
  | where TimeGenerated > ago(30m)
  | summarize Count=count() by AppRoleName, Name, Target, ResultCode, Success
  ```
  ```kql
  AppMetrics
  | where TimeGenerated > ago(30m) and Name startswith "agent."
  | summarize Value=sum(Sum) by Name, bin(TimeGenerated, 5m)
  ```

Show **Cosmos DB → Data Explorer** → `agentsdb` → `conversations` / `interactions`; note the
partition keys (`/sessionId` for `conversations`, `/conversationId` for `interactions`). This is the
data mirrored in Challenge 3.

Record the handoff values shown by `azd env get-values`, including
`AZURE_LOG_ANALYTICS_WORKSPACE_NAME` and `AZURE_LOG_ANALYTICS_WORKSPACE_ID`.

## Checkpoint verification

Have the team walk you through **one** message:

1. The request in **Transaction search** with correlated backend → agent → model/Cosmos operations.
2. The **Application Map** showing named backend and agent services plus dependencies.
3. Non-empty `AppRequests`, `AppDependencies`, and agent `AppMetrics` query results.
4. The matching **conversation** document in Cosmos DB.
5. The recorded Log Analytics workspace name and resource ID.

✅ Pass when all five are shown and they've recorded the App Insights, Log Analytics, and Cosmos
resource coordinates.

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
| `AppRoleName` is `unknown_service` | Confirm `OTEL_SERVICE_NAME` is set on the backend and agent Container Apps, then deploy a new revision |
| Requests exist but backend → agent or agent → model is absent | Confirm `opentelemetry-instrumentation-httpx` is installed in both images and deploy new revisions |
| Can't find custom metrics | Query `AppMetrics` in Logs to confirm names (`agent.tokens.*`, `agent.duration_ms`) |

## Talking points (mini-briefing)

- **Application telemetry begins at the backend.** Distributed tracing connects backend → agent →
  model and Cosmos so you can attribute latency and errors precisely. Frontend and APIM telemetry
  remain future hardening opportunities.
- **Managed identity everywhere** — no secrets; auth is Entra + RBAC. This is also how Fabric will
  reach the data later.
- **Tokens = money.** The custom token metric is the seed of cost-per-request and FinOps chargeback
  in Challenges 4–6. Connect today's metric to that future payoff.
- **Serverless Cosmos DB** is the conversation system-of-record — and the Mirroring source in
  Challenge 3.

## If they finish early

- Script sustained load and watch **Container Apps autoscale** (Scale and replicas).
- Explore **APIM Analytics** (rate limiting, PTU-aware load balancing) as future Control Tower input.
- Compare synchronous and streaming agent calls in `AppRequests`, `AppDependencies`, and `AppMetrics`.

## Reference assets

- [`resources/agent-workload/README.md`](../resources/agent-workload/README.md) — full service/API/monitoring detail
- [`resources/agent-workload/infra/`](../resources/agent-workload/infra/) — Bicep modules
