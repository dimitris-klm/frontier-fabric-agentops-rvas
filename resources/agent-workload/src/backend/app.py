import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import httpx
from azure.cosmos.aio import CosmosClient
from azure.identity.aio import DefaultAzureCredential
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

COSMOS_DB_ENDPOINT = os.environ.get("COSMOS_DB_ENDPOINT", "")
COSMOS_DATABASE = os.environ.get("COSMOS_DATABASE", "agentsdb")
AGENT_SERVICE_URL = os.environ.get("AGENT_SERVICE_URL", "http://localhost:8001")
APPLICATIONINSIGHTS_CONNECTION_STRING = os.environ.get("APPLICATIONINSIGHTS_CONNECTION_STRING", "")
AZURE_CLIENT_ID = os.environ.get("AZURE_CLIENT_ID", "")

if APPLICATIONINSIGHTS_CONNECTION_STRING:
    from azure.monitor.opentelemetry import configure_azure_monitor

    configure_azure_monitor(connection_string=APPLICATIONINSIGHTS_CONNECTION_STRING)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class CreateConversationRequest(BaseModel):
    title: str
    metadata: dict = Field(default_factory=dict)


class SendMessageRequest(BaseModel):
    content: str
    role: str = "user"


class Message(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    conversationId: str
    sessionId: str
    role: str
    content: str
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    model: str | None = None
    promptTokens: int | None = None
    completionTokens: int | None = None
    totalTokens: int | None = None
    durationMs: float | None = None
    status: str | None = None


class Conversation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    sessionId: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    metadata: dict = Field(default_factory=dict)
    createdAt: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updatedAt: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    messages: list[Message] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Application lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    credential = DefaultAzureCredential(managed_identity_client_id=AZURE_CLIENT_ID) if AZURE_CLIENT_ID else DefaultAzureCredential()
    cosmos_client = CosmosClient(COSMOS_DB_ENDPOINT, credential=credential)
    database = cosmos_client.get_database_client(COSMOS_DATABASE)
    app.state.conversations_container = database.get_container_client("conversations")
    app.state.interactions_container = database.get_container_client("interactions")
    app.state.http_client = httpx.AsyncClient(timeout=60.0)
    logger.info("Backend service started")
    yield
    await app.state.http_client.aclose()
    await cosmos_client.close()
    await credential.close()
    logger.info("Backend service shut down")


app = FastAPI(title="Observability Demo Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health():
    return {"status": "healthy", "service": "backend"}


@app.post("/api/conversations", status_code=201)
async def create_conversation(request: CreateConversationRequest):
    conversation = Conversation(title=request.title, metadata=request.metadata)
    item = conversation.model_dump()
    try:
        await app.state.conversations_container.create_item(body=item)
    except Exception as exc:
        logger.exception("Failed to create conversation")
        raise HTTPException(status_code=500, detail=str(exc))
    return item


@app.get("/api/conversations/{conversation_id}")
async def get_conversation(conversation_id: str):
    try:
        query = "SELECT * FROM c WHERE c.id = @id"
        parameters = [{"name": "@id", "value": conversation_id}]
        items = [
            item
            async for item in app.state.conversations_container.query_items(
                query=query, parameters=parameters
            )
        ]
        if not items:
            raise HTTPException(status_code=404, detail="Conversation not found")
        conversation = items[0]

        messages_query = "SELECT * FROM c WHERE c.conversationId = @cid ORDER BY c.timestamp ASC"
        messages_params = [{"name": "@cid", "value": conversation_id}]
        messages = [
            msg
            async for msg in app.state.interactions_container.query_items(
                query=messages_query, parameters=messages_params
            )
        ]
        conversation["messages"] = messages
        return conversation
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to get conversation")
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/conversations/{conversation_id}/messages", status_code=201)
async def send_message(conversation_id: str, request: SendMessageRequest):
    try:
        query = "SELECT * FROM c WHERE c.id = @id"
        parameters = [{"name": "@id", "value": conversation_id}]
        items = [
            item
            async for item in app.state.conversations_container.query_items(
                query=query, parameters=parameters
            )
        ]
        if not items:
            raise HTTPException(status_code=404, detail="Conversation not found")
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to verify conversation")
        raise HTTPException(status_code=500, detail=str(exc))

    conversation = items[0]
    session_id = conversation["sessionId"]
    user_message = Message(
        conversationId=conversation_id,
        sessionId=session_id,
        role=request.role,
        content=request.content,
        status="accepted",
    )
    try:
        await app.state.interactions_container.create_item(
            body=user_message.model_dump(exclude_none=True)
        )
    except Exception as exc:
        logger.exception("Failed to store user message")
        raise HTTPException(status_code=500, detail=str(exc))

    try:
        agent_response = await app.state.http_client.post(
            f"{AGENT_SERVICE_URL}/api/agent/invoke",
            json={
                "messages": [{"role": request.role, "content": request.content}],
                "session_id": conversation_id,
            },
        )
        agent_response.raise_for_status()
        agent_data = agent_response.json()
        agent_content = agent_data.get("response", agent_data.get("content", ""))
    except httpx.HTTPStatusError as exc:
        logger.exception("Agent service returned an error")
        raise HTTPException(status_code=502, detail=f"Agent service error: {exc.response.status_code}")
    except Exception as exc:
        logger.exception("Failed to call agent service")
        raise HTTPException(status_code=502, detail=f"Agent service unavailable: {exc}")

    usage = agent_data.get("usage") or {}
    prompt_tokens = usage.get("prompt_tokens")
    completion_tokens = usage.get("completion_tokens")
    total_tokens = (
        prompt_tokens + completion_tokens
        if prompt_tokens is not None and completion_tokens is not None
        else None
    )
    assistant_message = Message(
        conversationId=conversation_id,
        sessionId=session_id,
        role="assistant",
        content=agent_content,
        model=agent_data.get("model"),
        promptTokens=prompt_tokens,
        completionTokens=completion_tokens,
        totalTokens=total_tokens,
        durationMs=agent_data.get("duration_ms"),
        status="succeeded",
    )
    try:
        await app.state.interactions_container.create_item(
            body=assistant_message.model_dump(exclude_none=True)
        )
    except Exception as exc:
        logger.exception("Failed to store assistant message")
        raise HTTPException(status_code=500, detail=str(exc))

    try:
        conversation["updatedAt"] = datetime.now(timezone.utc).isoformat()
        await app.state.conversations_container.upsert_item(body=conversation)
    except Exception as exc:
        logger.warning("Failed to update conversation timestamp: %s", exc)

    return {
        "userMessage": user_message.model_dump(exclude_none=True),
        "assistantMessage": assistant_message.model_dump(exclude_none=True),
    }
