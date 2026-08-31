"""Azure AI Agent Service - FastAPI application with OpenTelemetry instrumentation."""

import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Optional

from azure.identity import DefaultAzureCredential
from azure.monitor.opentelemetry import configure_azure_monitor
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openai import AzureOpenAI
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

AZURE_OPENAI_ENDPOINT = os.environ.get("AZURE_OPENAI_ENDPOINT", "")
AZURE_OPENAI_DEPLOYMENT = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-5-mini")
APPLICATIONINSIGHTS_CONNECTION_STRING = os.environ.get("APPLICATIONINSIGHTS_CONNECTION_STRING", "")
AZURE_CLIENT_ID = os.environ.get("AZURE_CLIENT_ID", "")

SYSTEM_MESSAGE = (
    "You are a helpful AI assistant powered by Azure AI Foundry. "
    "You provide clear, accurate, and concise responses."
)

COGNITIVE_SERVICES_SCOPE = "https://cognitiveservices.azure.com/.default"


class Message(BaseModel):
    role: str
    content: str


class AgentRequest(BaseModel):
    messages: list[Message]
    session_id: Optional[str] = None
    model: Optional[str] = Field(default=None, description="Model override (uses deployment default if not set)")


class UsageInfo(BaseModel):
    prompt_tokens: int
    completion_tokens: int


class AgentResponse(BaseModel):
    response: str
    model: str
    usage: UsageInfo


class StreamChunk(BaseModel):
    content: str
    done: bool
    usage: Optional[UsageInfo] = None


class HealthResponse(BaseModel):
    status: str
    service: str


def _get_openai_client() -> AzureOpenAI:
    credential = DefaultAzureCredential(
        managed_identity_client_id=AZURE_CLIENT_ID if AZURE_CLIENT_ID else None
    )
    token = credential.get_token(COGNITIVE_SERVICES_SCOPE)
    return AzureOpenAI(
        azure_endpoint=AZURE_OPENAI_ENDPOINT,
        api_key=token.token,
        api_version="2025-04-01-preview",
    )


def _build_messages(request: AgentRequest) -> list[dict]:
    return [{"role": "system", "content": SYSTEM_MESSAGE}] + [
        {"role": m.role, "content": m.content} for m in request.messages
    ]


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Agent service starting up")
    if APPLICATIONINSIGHTS_CONNECTION_STRING:
        configure_azure_monitor(
            connection_string=APPLICATIONINSIGHTS_CONNECTION_STRING,
        )
        logger.info("Azure Monitor telemetry configured")
    else:
        logger.warning("APPLICATIONINSIGHTS_CONNECTION_STRING not set; telemetry disabled")
    yield
    logger.info("Agent service shutting down")


app = FastAPI(title="Agent Service", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthResponse)
async def health():
    return HealthResponse(status="healthy", service="agent")


@app.post("/api/agent/invoke", response_model=AgentResponse)
async def invoke(request: AgentRequest):
    try:
        client = _get_openai_client()
        deployment = request.model or AZURE_OPENAI_DEPLOYMENT
        messages = _build_messages(request)

        completion = client.chat.completions.create(
            model=deployment,
            messages=messages,
        )

        choice = completion.choices[0]
        return AgentResponse(
            response=choice.message.content or "",
            model=completion.model,
            usage=UsageInfo(
                prompt_tokens=completion.usage.prompt_tokens,
                completion_tokens=completion.usage.completion_tokens,
            ),
        )
    except Exception as e:
        logger.exception("Error invoking agent")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/agent/stream")
async def stream(request: AgentRequest):
    async def event_generator():
        try:
            client = _get_openai_client()
            deployment = request.model or AZURE_OPENAI_DEPLOYMENT
            messages = _build_messages(request)

            response = client.chat.completions.create(
                model=deployment,
                messages=messages,
                stream=True,
                stream_options={"include_usage": True},
            )

            usage_info = None
            for chunk in response:
                if chunk.usage:
                    usage_info = UsageInfo(
                        prompt_tokens=chunk.usage.prompt_tokens,
                        completion_tokens=chunk.usage.completion_tokens,
                    )

                if chunk.choices:
                    delta = chunk.choices[0].delta
                    content = delta.content or ""
                    data = StreamChunk(content=content, done=False)
                    yield f"data: {data.model_dump_json()}\n\n"

            final = StreamChunk(content="", done=True, usage=usage_info)
            yield f"data: {final.model_dump_json()}\n\n"

        except Exception as e:
            logger.exception("Error during streaming")
            error_data = json.dumps({"error": str(e), "done": True})
            yield f"data: {error_data}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
