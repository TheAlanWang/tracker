"""Schemas for the in-app AI agent endpoint.

The request carries the visible chat thread (prior turns + the new user
message as the last entry). The backend is stateless — it rebuilds the
Anthropic message list from this each call and re-injects fresh page
context, so there is no server-side session to keep in sync.

Responses are streamed as Server-Sent-Events; the event payloads below
document the shapes the frontend parses. They're emitted as JSON via the
SSE `data:` field, one event per chunk.
"""

from typing import Literal

from pydantic import BaseModel, Field

AgentRole = Literal["user", "assistant"]


class AgentMessage(BaseModel):
    role: AgentRole
    content: str = Field(max_length=10000)


class AgentRequest(BaseModel):
    # Full visible thread, oldest first, with the new user message last.
    # Bounded so a client can't replay an unbounded history at us.
    messages: list[AgentMessage] = Field(min_length=1, max_length=50)
    # When the panel is opened from a task page, the human identifier of the
    # task in view (e.g. "RAG-10"). The agent stays project-scoped; this only
    # focuses the page context on that task. Bounded to a sane identifier size.
    focus_task: str | None = Field(default=None, max_length=64)


# ── SSE event payloads (documentation; emitted as JSON dicts) ────────────
# Each is tagged by `type` so the frontend can switch on it.


class TextDeltaEvent(BaseModel):
    type: Literal["text_delta"] = "text_delta"
    text: str


class ToolCallEvent(BaseModel):
    type: Literal["tool_call"] = "tool_call"
    name: str
    # A short human-readable summary of the call for the tool-call pill,
    # e.g. "create_task" with input {"title": "..."}.
    input: dict


class ToolResultEvent(BaseModel):
    type: Literal["tool_result"] = "tool_result"
    name: str
    ok: bool
    # Compact summary string for the pill (not the full tool output).
    summary: str


class QuotaEvent(BaseModel):
    type: Literal["quota"] = "quota"
    used: int
    cap: int
    remaining: int


class DoneEvent(BaseModel):
    type: Literal["done"] = "done"


class ErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    message: str
