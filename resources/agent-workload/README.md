# Agent Workload — Reference Component

> **Part of the [Frontier Fabric AgentOps RVAS](../../README.md).** This is the telemetry
> **source** you deploy in **[Challenge 1](../../challenges/challenge-01-agent-telemetry.md)** — a
> full-stack Azure AI Foundry agent that emits the traces, custom token/cost metrics, and
> conversation data the Control Tower later correlates.

<!-- Badges -->
![Azure](https://img.shields.io/badge/Azure-Container%20Apps-blue)
![Python](https://img.shields.io/badge/Python-3.12-green)
![Node.js](https://img.shields.io/badge/Node.js-20-green)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

> Full-stack AI agent runtime with end-to-end observability — from user click to model inference.

---

## Architecture Overview

The **Agents Runtime** is the core execution block of the observability platform. It processes requests across three microservices, persists data, and emits telemetry at every layer.

| Component | Role |
|---|---|
| **Azure AI Foundry** | Provides the `gpt-5-mini` model endpoint for agent inference via a managed deployment. |
| **Azure Container Apps** | Hosts three microservices — frontend, backend, and agent — in a shared managed environment with built-in autoscaling. |
| **Azure API Management** | Provisions API definitions and policies for future gateway integration; it is not in the reference application's active request path. |
| **Azure Cosmos DB** | Stores conversations, individual interactions, and agent configuration using a serverless throughput model. |
| **Application Insights** | Full-stack telemetry — distributed traces, live metrics, dependency maps, and custom counters for token usage. |

### Architecture Diagram

```text
User → Frontend (Next.js) → Backend (FastAPI) → Agent (FastAPI) → Azure AI Foundry
                │
                └→ Cosmos DB (agentsdb)

Frontend + Backend + Agent → Application Insights

API Management is provisioned for future gateway integration but is not in this active path.
```

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Azure Subscription | Contributor access | [azure.com](https://azure.microsoft.com/free/) |
| Azure CLI (`az`) | 2.60+ | `brew install azure-cli` or [docs](https://learn.microsoft.com/cli/azure/install-azure-cli) |
| Azure Developer CLI (`azd`) | 1.10+ | `curl -fsSL https://aka.ms/install-azd.sh \| bash` |
| Docker Desktop | Latest | [docker.com](https://www.docker.com/products/docker-desktop/) |
| Node.js | 20+ | `nvm install 20` or [nodejs.org](https://nodejs.org/) |
| Python | 3.12+ | `pyenv install 3.12` or [python.org](https://www.python.org/) |

---

## Quick Start

```bash
# Authenticate with Azure
azd auth login

# Initialize the environment (first time only)
azd init

# Provision infrastructure and deploy all services
azd up
```

Docker must be running. `azd up` is the normal path when containers can download packages from npm
and PyPI. If a restricted network blocks local container package downloads, run `azd provision`,
build the `agent`, `backend`, and `frontend` images with `az acr build`, and attach them with
`az containerapp update`. See the Challenge 1 coach guide for the exact fallback commands.

After deployment completes, `azd` prints the service URLs:

```
  frontend  https://frontend.<env>.<region>.azurecontainerapps.io
  backend   https://backend.<env>.<region>.azurecontainerapps.io
  agent     https://agent.<env>.<region>.azurecontainerapps.io
```

---

## Services

### Frontend — `src/frontend`

| Property | Value |
|---|---|
| **Technology** | Next.js 14 (React, TypeScript) |
| **Port** | 3000 |
| **Purpose** | Modern chat interface for user interactions with the AI agent. Renders streaming responses, manages conversation state, and provides a clean UX for the RVAS. |

### Backend — `src/backend`

| Property | Value |
|---|---|
| **Technology** | FastAPI (Python 3.12) |
| **Port** | 8000 |
| **Purpose** | API layer for conversation management. Handles CRUD operations on conversations and messages, persists data to Cosmos DB, and routes agent invocations to the agent service. |

### Agent — `src/agent`

| Property | Value |
|---|---|
| **Technology** | FastAPI (Python 3.12) |
| **Port** | 8001 |
| **Purpose** | AI agent runtime that receives user messages, constructs prompts with conversation context, invokes the Azure AI Foundry model endpoint, and returns completions. Supports both synchronous and streaming responses. |

---

## API Reference

### Backend Service (`/api`)

#### Create a Conversation

```http
POST /api/conversations
Content-Type: application/json

{
  "title": "New Conversation"
}
```

**Response** `201 Created`

```json
{
  "id": "conv-abc123",
  "title": "New Conversation",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

#### Get a Conversation

```http
GET /api/conversations/{id}
```

**Response** `200 OK`

```json
{
  "id": "conv-abc123",
  "title": "New Conversation",
  "messages": [
    {
      "role": "user",
      "content": "Hello!",
      "timestamp": "2024-01-15T10:31:00Z"
    },
    {
      "role": "assistant",
      "content": "Hi there! How can I help you today?",
      "timestamp": "2024-01-15T10:31:02Z"
    }
  ],
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:31:02Z"
}
```

#### Send a Message

```http
POST /api/conversations/{id}/messages
Content-Type: application/json

{
  "role": "user",
  "content": "Explain observability in distributed systems."
}
```

**Response** `200 OK`

```json
{
  "role": "assistant",
  "content": "Observability in distributed systems refers to...",
  "timestamp": "2024-01-15T10:32:05Z",
  "usage": {
    "prompt_tokens": 128,
    "completion_tokens": 256,
    "total_tokens": 384
  }
}
```

#### Health Check (Backend)

```http
GET /api/health
```

**Response** `200 OK`

```json
{ "status": "healthy", "service": "backend", "version": "1.0.0" }
```

### Agent Service (`/api/agent`)

#### Invoke Agent (Synchronous)

```http
POST /api/agent/invoke
Content-Type: application/json

{
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "What is Azure Container Apps?" }
  ],
  "temperature": 0.7,
  "max_tokens": 1024
}
```

**Response** `200 OK`

```json
{
  "response": "Azure Container Apps is a serverless container platform...",
  "usage": {
    "prompt_tokens": 64,
    "completion_tokens": 200
  },
  "model": "gpt-5-mini"
}
```

#### Invoke Agent (Streaming)

```http
POST /api/agent/stream
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "Write a haiku about cloud computing." }
  ]
}
```

**Response** `200 OK` (Server-Sent Events)

```
data: {"delta": "Servers ", "type": "content"}
data: {"delta": "in the sky,", "type": "content"}
data: {"delta": "\n", "type": "content"}
data: {"delta": "Scaling ", "type": "content"}
data: {"delta": "without limits—", "type": "content"}
data: {"delta": "\n", "type": "content"}
data: {"delta": "Code ", "type": "content"}
data: {"delta": "runs everywhere.", "type": "content"}
data: {"type": "done", "usage": {"prompt_tokens": 32, "completion_tokens": 18, "total_tokens": 50}}
```

#### Health Check (Agent)

```http
GET /api/health
```

**Response** `200 OK`

```json
{ "status": "healthy", "service": "agent" }
```

---

## Environment Variables

### Backend Service

| Variable | Description | Required |
|---|---|---|
| `COSMOS_DB_ENDPOINT` | Azure Cosmos DB account endpoint URL | Yes |
| `COSMOS_DATABASE` | Cosmos DB database name (default: `agentsdb`) | No |
| `AGENT_SERVICE_URL` | Internal URL of the agent service | Yes |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Application Insights connection string for telemetry | Yes |
| `AZURE_CLIENT_ID` | Managed identity client ID for Cosmos DB authentication | Yes |
| `PORT` | Server port (default: `8000`) | No |

### Agent Service

| Variable | Description | Required |
|---|---|---|
| `AZURE_OPENAI_ENDPOINT` | Azure AI Foundry / OpenAI endpoint URL | Yes |
| `AZURE_OPENAI_DEPLOYMENT` | Model deployment name (default: `gpt-5-mini`) | Yes |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Application Insights connection string for telemetry | Yes |
| `AZURE_CLIENT_ID` | Managed identity client ID for Azure OpenAI authentication | Yes |
| `PORT` | Server port (default: `8001`) | No |

### Frontend Service

| Variable | Description | Required |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Backend API base URL resolved by the frontend's runtime `/api/config` route | Yes |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Application Insights connection string for telemetry | No |
| `PORT` | Server port (default: `3000`) | No |

---

## Local Development

### 1. Backend

```bash
cd src/backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Set required environment variables
export COSMOS_DB_ENDPOINT="https://<your-account>.documents.azure.com:443/"
export COSMOS_DATABASE="agentsdb"
export AGENT_SERVICE_URL="http://localhost:8001"
export APPLICATIONINSIGHTS_CONNECTION_STRING="<your-connection-string>"

uvicorn app:app --reload --port 8000
```

### 2. Agent

```bash
cd src/agent
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Set required environment variables
export AZURE_OPENAI_ENDPOINT="https://<your-resource>.openai.azure.com/"
export AZURE_OPENAI_DEPLOYMENT="gpt-5-mini"
export APPLICATIONINSIGHTS_CONNECTION_STRING="<your-connection-string>"

uvicorn app:app --reload --port 8001
```

### 3. Frontend

```bash
cd src/frontend
npm install

# Create .env.local
echo 'NEXT_PUBLIC_API_URL=http://localhost:8000' > .env.local

npm run dev
```

The frontend is available at `http://localhost:3000`.

---

## Monitoring & Observability

### Application Insights Integration

All three services emit telemetry through the **Azure Monitor OpenTelemetry SDK**. Traces, metrics, and logs are collected automatically and correlated across service boundaries.

#### Distributed Tracing

Every inbound HTTP request generates a trace that flows through the entire call chain:

```
Frontend → APIM → Backend → Agent → Azure OpenAI
```

Each span in the trace includes:
- HTTP method, URL, and status code
- Duration and dependency details
- Custom attributes (conversation ID, model name, token counts)

**View traces:** Azure Portal → Application Insights → Transaction search → filter by operation name.

#### Application Map

The Application Map automatically discovers service dependencies and displays:
- Request rates and failure rates between services
- Average response times per dependency
- Cosmos DB and Azure OpenAI as external dependencies

**View the map:** Azure Portal → Application Insights → Application map.

#### Custom Metrics

The agent service emits custom metrics for model usage:

| Metric | Description |
|---|---|
| `agent.invocations` | Count of agent invocations (sync + stream) |
| `agent.tokens.prompt` | Prompt tokens consumed per request |
| `agent.tokens.completion` | Completion tokens generated per request |
| `agent.duration_ms` | End-to-end model inference duration |

**View metrics:** Azure Portal → Application Insights → Metrics → select custom namespace.

#### Live Metrics

Monitor real-time request rates, failure rates, and dependency durations during the RVAS.

**View live metrics:** Azure Portal → Application Insights → Live metrics.

#### Log Analytics (KQL)

Query structured logs across all services:

```kql
// End-to-end latency for agent invocations
requests
| where name == "POST /api/agent/invoke"
| summarize avg(duration), percentile(duration, 95) by bin(timestamp, 5m)
| render timechart
```

```kql
// Token usage over time
customMetrics
| where name == "agent.tokens.completion"
| summarize sum(value) by bin(timestamp, 1h)
| render columnchart
```

### Cosmos DB Query Metrics

Cosmos DB request units (RU) and latency are captured as dependency telemetry in Application Insights. Filter dependencies by type `Azure DocumentDB` to analyze:

- RU consumption per query
- Latency distribution (p50, p95, p99)
- Throttled requests (HTTP 429)

### APIM Analytics Dashboard

APIM is provisioned but is not in the reference application's active request path. Its analytics
will remain empty until clients are explicitly routed through the APIM gateway.

API Management provides built-in analytics:

- **Requests:** Total calls, success/failure rates, response times by API and operation
- **Geography:** Request distribution by region
- **Errors:** Top failing operations with error details
- **Capacity:** Gateway utilization and backend health

**View analytics:** Azure Portal → API Management → Analytics.

---

## Infrastructure

The infrastructure is defined in Bicep modules under `infra/`:

| Module | Resources Provisioned |
|---|---|
| `main.bicep` | Orchestrates modules; creates Azure AI Services, the `gpt-5-mini` deployment, managed identity, Key Vault, and role assignments |
| `container-apps.bicep` | ACR, Container Apps Environment, three Container Apps, scaling rules, and ACR pull assignment |
| `cosmos-db.bicep` | Cosmos DB account (serverless), `agentsdb` database, `conversations` and `interactions` containers with partition keys |
| `api-management.bicep` | APIM instance, API definitions, and rate-limit/CORS policies for future gateway integration |
| `monitoring.bicep` | Log Analytics workspace, Application Insights instance, diagnostic settings for all resources |

---

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and add tests where applicable
4. Ensure all existing tests pass
5. Commit with a descriptive message: `git commit -m "feat: add conversation export"`
6. Push to your fork: `git push origin feature/my-feature`
7. Open a Pull Request against `main`

Please follow the [Conventional Commits](https://www.conventionalcommits.org/) specification for commit messages.

---

## License

This project is licensed under the **MIT License**.

```
MIT License

Copyright (c) 2025 AgentOps Control Tower Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
