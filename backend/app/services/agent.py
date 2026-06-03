"""In-app AI agent — a Claude tool-use loop scoped to one project.

The agent talks with the user, sees a snapshot of the current project's
board, and turns goals into work: decompose a goal into tasks, create and
assign them, move/update existing ones, comment. It is the app's first LLM
integration; the Anthropic key stays server-side (external-service pattern,
mirroring billing.py / emails.py).

Design (locked with the user):
  - A plain Claude tool-use loop (no agent framework). Streaming SSE.
  - Tools call the EXISTING backend services in-process via the per-user,
    RLS-scoped Supabase client — the agent inherits the caller's
    permissions and can touch nothing the user can't.
  - Bound to the request's project/workspace: project_id and workspace_id
    are closures, not tool parameters, so the model can't target another
    project. Any task reference is validated to live in the bound project.
  - Writes execute directly and are surfaced in the chat thread; the board
    live-updates from the frontend cache invalidation.
  - The tool *surface* mirrors the MCP tool names (parity: human UI ↔ MCP
    ↔ in-app agent).
"""

import json
import logging
from collections.abc import AsyncIterator
from typing import Any, Awaitable, Callable

from anthropic import AsyncAnthropic
from supabase import AsyncClient

from app.core.config import Settings
from app.schemas.task import TaskCreate, TaskUpdate
from app.services import comments as comments_svc
from app.services import members as members_svc
from app.services import agent_store
from app.services import search as search_svc
from app.services import tasks as tasks_svc
from app.services._user_profiles import user_profile_from_auth
from app.services.usage import AgentUsage

logger = logging.getLogger("app")

# Guardrail: how many tool round-trips a single user turn may trigger before
# we force a stop. Decomposing a goal into ~10 tasks is a handful of
# create_task calls; this leaves headroom while capping runaway cost.
_MAX_TOOL_ITERATIONS = 12

# Bounded snapshot of the board injected into the system prompt so the agent
# "sees the page" without being asked. Keep small — the agent can list_tasks
# for more.
_PAGE_SNAPSHOT_LIMIT = 40

# Stable instruction prefix. Kept byte-stable (no timestamps / ids) so the
# tools + this block form a cacheable prompt prefix across turns.
_SYSTEM_INSTRUCTIONS = """\
You are Trackly's in-app assistant, embedded in a single project's board. \
You help the user plan and manage their work: break goals into tasks, \
create and assign tasks, update or move existing ones, and answer questions \
about what's on the board.

How to work:
- You are scoped to ONE project (described below) and act as the current \
user. You cannot see or touch other projects.
- A snapshot of the current board is given below so you already know what's \
on it — don't ask the user to describe tasks you can already see. Call \
`list_tasks` only when you need fresher or filtered data.
- Before CREATING new tasks, first show the user the list you propose \
(titles, plus priority/assignee/due where relevant) and ask them to confirm. \
Only call `create_task` after they say yes (e.g. "confirm", "go ahead", \
"可以", "确认"). Don't create tasks in the same turn you propose them.
- For an explicit change the user directly named — e.g. "move RAG-6 to done", \
"assign TES-3 to me", "set X to high priority" — just do it with the tools, \
no confirmation needed. The board updates live.
- When you tell the user you're creating or changing something, you MUST call \
the tool(s) in that SAME turn. Never say you created / updated / assigned \
something unless you actually called the tool — claiming an action you didn't \
perform is a serious error.
- When creating several tasks at once, emit all the `create_task` calls \
together in a single turn (in parallel), not one per message — it's much \
faster for the user.
- You cannot create checklists or sub-items in this version. If the user \
wants a checklist or step-by-step guidance, put those steps in the task's \
`description` instead, and tell them checklists aren't supported yet.
- To assign a task to someone, first call `list_workspace_members` to get \
their user id, then pass that id as `assignee_id`. Never guess an id.
- When the user refers to themselves ("me", "my", "myself", "I"), they mean \
the current user identified in the context below — use that user_id directly \
as the assignee; no need to look them up.
- Reference existing tasks by their identifier (e.g. RAG-6) — the tools \
resolve it within this project.
- When breaking a goal into tasks, propose concise, concrete, individually \
actionable tasks. Prefer a handful of well-scoped tasks over many tiny ones. \
Show the proposed list and ask the user to confirm before creating them.
- You have a long-term memory of this user, scoped to this workspace (shown \
below if any). When you learn something durable about how they work — a \
standing preference, who owns what, a recurring convention — call `remember` \
to save it so you recall it next time. Don't memorize one-off task details or \
anything that won't still be true next week. If they ask you to forget their \
saved info, call `forget`.
- Be concise. After acting, give a short summary of what changed — don't \
restate the whole board.
- Reply in the same language and script the user writes in. If they write \
Simplified Chinese, reply in Simplified Chinese (not Traditional); match \
their language for every reply.
"""

# Tool surface — names mirror the MCP server's tools for parity. Schemas are
# module-level constants so the tool list is deterministic (cacheable).
_STATUS_ENUM = ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"]
_PRIORITY_ENUM = ["no_priority", "urgent", "high", "medium", "low"]

TOOLS: list[dict] = [
    {
        "name": "list_tasks",
        "description": (
            "List tasks in the current project. Optionally filter by status. "
            "Use when you need fresher or filtered data than the board "
            "snapshot already provided."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": _STATUS_ENUM},
            },
        },
    },
    {
        "name": "search",
        "description": (
            "Fuzzy-search across the workspace (tasks, projects, labels, "
            "goals, sprints) by text. Use to find something not on the "
            "current board."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
    },
    {
        "name": "create_task",
        "description": "Create a new task in the current project.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "description": {"type": "string"},
                "status": {"type": "string", "enum": _STATUS_ENUM},
                "priority": {"type": "string", "enum": _PRIORITY_ENUM},
                "assignee_id": {
                    "type": "string",
                    "description": "Workspace member user id (from list_workspace_members).",
                },
                "due_date": {"type": "string", "description": "ISO date YYYY-MM-DD."},
            },
            "required": ["title"],
        },
    },
    {
        "name": "update_task",
        "description": (
            "Update an existing task in the current project — status, "
            "priority, assignee, due date, title, or description. Reference "
            "the task by its identifier (e.g. RAG-6)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "task": {
                    "type": "string",
                    "description": "Task identifier (RAG-6) or id.",
                },
                "title": {"type": "string"},
                "description": {"type": "string"},
                "status": {"type": "string", "enum": _STATUS_ENUM},
                "priority": {"type": "string", "enum": _PRIORITY_ENUM},
                "assignee_id": {
                    "type": ["string", "null"],
                    "description": "Member user id, or null to unassign.",
                },
                "due_date": {"type": "string", "description": "ISO date YYYY-MM-DD."},
            },
            "required": ["task"],
        },
    },
    {
        "name": "add_comment",
        "description": "Add a comment to a task in the current project.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task": {"type": "string", "description": "Task identifier (RAG-6) or id."},
                "body": {"type": "string"},
            },
            "required": ["task", "body"],
        },
    },
    {
        "name": "list_workspace_members",
        "description": (
            "List the workspace's members (name, email, user id). Use to "
            "find the assignee_id before assigning a task to someone."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "remember",
        "description": (
            "Save a durable fact or preference about this user so you recall "
            "it in future conversations (e.g. 'prefers high priority', "
            "'owns the frontend work'). Use sparingly — only for things that "
            "stay true across sessions, not one-off task details. The memory "
            "is scoped to this workspace."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "fact": {"type": "string", "description": "A short, durable fact."}
            },
            "required": ["fact"],
        },
    },
    {
        "name": "forget",
        "description": (
            "Clear everything you've remembered about this user in this "
            "workspace. Use only when the user explicitly asks you to forget "
            "their preferences / saved info."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
]


class AgentError(Exception):
    """Raised when a tool reference is invalid (e.g. task not in project)."""


def _sse(payload: dict) -> str:
    """Format one event for an SSE stream."""
    return f"data: {json.dumps(payload)}\n\n"


def _looks_like_uuid(s: str) -> bool:
    return len(s) == 36 and s.count("-") == 4


async def _resolve_task_id(
    supabase: AsyncClient, *, project_id: str, ref: str
) -> str:
    """Resolve a task reference (identifier like RAG-6, or a raw id) to an id
    that is guaranteed to belong to the bound project. Raises AgentError if
    no such task exists in this project."""
    query = supabase.table("tasks").select("id").eq("project_id", project_id)
    if _looks_like_uuid(ref):
        query = query.eq("id", ref)
    else:
        query = query.ilike("identifier", ref.strip())
    rows = (await query.limit(1).execute()).data
    if not rows:
        raise AgentError(f"No task '{ref}' in this project.")
    return rows[0]["id"]


def _task_brief(t: Any) -> dict:
    """Compact task view for tool results and the board snapshot."""
    return {
        "id": t.identifier,
        "title": t.title,
        "status": t.status,
        "priority": t.priority,
        "assignee_id": t.assignee_id,
        "due_date": t.due_date.isoformat() if t.due_date else None,
    }


def _build_handlers(
    supabase: AsyncClient,
    *,
    user_id: str,
    project_id: str,
    workspace_id: str,
    ws_slug: str,
) -> dict[str, Callable[[dict], Awaitable[str]]]:
    """Build the tool dispatch table. Each handler returns a compact string
    (JSON) suitable as a tool_result. project_id/workspace_id are closed over
    so the model cannot target a different project."""

    async def list_tasks(inp: dict) -> str:
        rows = await tasks_svc.list_tasks(
            supabase,
            user_id=user_id,
            project_id=project_id,
            status=inp.get("status"),
        )
        return json.dumps([_task_brief(t) for t in rows])

    async def search(inp: dict) -> str:
        results = await search_svc.search(
            supabase,
            user_id=user_id,
            query=inp["query"],
            workspace_id=workspace_id,
            ws_slug=ws_slug,
        )
        return json.dumps(
            [{"type": r.type, "label": r.label, "sublabel": r.sublabel} for r in results]
        )

    async def create_task(inp: dict) -> str:
        payload = TaskCreate(
            title=inp["title"],
            description=inp.get("description", ""),
            status=inp.get("status", "backlog"),
            priority=inp.get("priority", "no_priority"),
            assignee_id=inp.get("assignee_id"),
            due_date=inp.get("due_date"),
        )
        task = await tasks_svc.create_task(
            supabase, user_id=user_id, project_id=project_id, payload=payload
        )
        return json.dumps(_task_brief(task))

    async def update_task(inp: dict) -> str:
        task_id = await _resolve_task_id(
            supabase, project_id=project_id, ref=inp["task"]
        )
        fields = {
            k: inp[k]
            for k in ("title", "description", "status", "priority", "assignee_id", "due_date")
            if k in inp
        }
        payload = TaskUpdate(**fields)
        task = await tasks_svc.update_task(
            supabase, user_id=user_id, task_id=task_id, payload=payload
        )
        return json.dumps(_task_brief(task))

    async def add_comment(inp: dict) -> str:
        from app.schemas.comment import CommentCreate

        task_id = await _resolve_task_id(
            supabase, project_id=project_id, ref=inp["task"]
        )
        await comments_svc.create_comment(
            supabase,
            user_id=user_id,
            task_id=task_id,
            payload=CommentCreate(body=inp["body"]),
        )
        return json.dumps({"ok": True})

    async def list_workspace_members(inp: dict) -> str:
        members = await members_svc.list_members(
            supabase, user_id=user_id, workspace_id=workspace_id
        )
        return json.dumps(
            [
                {
                    "user_id": m.user_id,
                    "name": m.display_name or m.email,
                    "email": m.email,
                }
                for m in members
            ]
        )

    async def remember(inp: dict) -> str:
        await agent_store.add_memory(
            supabase,
            workspace_id=workspace_id,
            user_id=user_id,
            content=inp["fact"],
        )
        return json.dumps({"ok": True})

    async def forget(inp: dict) -> str:
        await agent_store.clear_memory(
            supabase, workspace_id=workspace_id, user_id=user_id
        )
        return json.dumps({"ok": True})

    return {
        "list_tasks": list_tasks,
        "search": search,
        "create_task": create_task,
        "update_task": update_task,
        "add_comment": add_comment,
        "list_workspace_members": list_workspace_members,
        "remember": remember,
        "forget": forget,
    }


# Tools that change board state — the frontend invalidates its task cache
# when it sees one of these in a tool_result event.
_WRITE_TOOLS = {"create_task", "update_task", "add_comment"}


async def _caller_identity(supabase: AsyncClient, user_id: str) -> str:
    """A one-line description of who the agent is talking to, so it can
    resolve "me"/"my" to this user_id. Best-effort: falls back to the bare id
    if the profile lookup fails."""
    try:
        resp = await supabase.auth.admin.get_user_by_id(user_id)
        profile = user_profile_from_auth(resp.user)
        name = (profile.get("display_name") or profile.get("email") or "").strip()
    except Exception:  # noqa: BLE001 — identity is best-effort
        name = ""
    who = f"{name} " if name else ""
    return f"You are talking to {who}(user_id: {user_id})."


async def _build_page_context(
    supabase: AsyncClient, *, user_id: str, project: dict, project_id: str
) -> str:
    """Compact snapshot of the project + its board, injected so the agent
    sees the page (and knows who it's talking to) without being asked."""
    try:
        rows = await tasks_svc.list_tasks(
            supabase, user_id=user_id, project_id=project_id
        )
    except Exception:  # noqa: BLE001 — snapshot is best-effort
        rows = []
    briefs = [_task_brief(t) for t in rows[:_PAGE_SNAPSHOT_LIMIT]]
    identity = await _caller_identity(supabase, user_id)
    return (
        f"{identity}\n"
        f"Current project: {project.get('name', '')} "
        f"(key {project.get('key', '')}).\n"
        f"Board snapshot ({len(briefs)} of {len(rows)} tasks):\n"
        f"{json.dumps(briefs, indent=0)}"
    )


def _to_anthropic_messages(thread: list) -> list[dict]:
    """Map the simplified chat thread to Anthropic message dicts. Prior
    assistant turns are sent as plain text (tool blocks from past turns are
    not replayed — each turn re-reads fresh page context)."""
    return [{"role": m.role, "content": m.content} for m in thread]


async def run_agent_stream(
    supabase: AsyncClient,
    settings: Settings,
    *,
    user_id: str,
    project: dict,
    ws_slug: str,
    thread: list,
    usage: AgentUsage,
) -> AsyncIterator[str]:
    """Run the tool-use loop, yielding SSE-formatted event strings.

    Membership and quota are already enforced by the router; `usage` is the
    post-consume snapshot, emitted up front so the panel can show remaining
    credits. The Anthropic key is assumed present (router 503s otherwise).
    """
    project_id = project["id"]
    workspace_id = project["workspace_id"]
    handlers = _build_handlers(
        supabase,
        user_id=user_id,
        project_id=project_id,
        workspace_id=workspace_id,
        ws_slug=ws_slug,
    )
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    # Emit current quota first so the UI updates immediately.
    yield _sse({"type": "quota", "used": usage.used, "cap": usage.cap, "remaining": usage.remaining})

    page_context = await _build_page_context(
        supabase, user_id=user_id, project=project, project_id=project_id
    )
    # Long-term memory: durable facts the user's agent has saved in this
    # workspace, injected so it carries understanding across conversations.
    try:
        facts = await agent_store.load_memory(
            supabase, workspace_id=workspace_id, user_id=user_id
        )
    except Exception:  # noqa: BLE001 — memory is best-effort
        facts = []
    if facts:
        page_context += "\n\nWhat you remember about this user (from past " \
            "conversations in this workspace):\n- " + "\n- ".join(facts)

    system = [
        {"type": "text", "text": _SYSTEM_INSTRUCTIONS, "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": page_context},
    ]
    messages = _to_anthropic_messages(thread)
    # Accumulate the user-visible reply text so we can persist the thread.
    assistant_text = ""

    try:
        for _ in range(_MAX_TOOL_ITERATIONS):
            async with client.messages.stream(
                model=settings.agent_model,
                max_tokens=4096,
                system=system,
                tools=TOOLS,
                messages=messages,
            ) as stream:
                async for event in stream:
                    if (
                        event.type == "content_block_delta"
                        and event.delta.type == "text_delta"
                    ):
                        assistant_text += event.delta.text
                        yield _sse({"type": "text_delta", "text": event.delta.text})
                final = await stream.get_final_message()

            if final.stop_reason != "tool_use":
                break

            # Replay the assistant turn (incl. tool_use blocks) then run each
            # tool and collect results for the next user turn.
            messages.append({"role": "assistant", "content": final.content})
            tool_results = []
            for block in final.content:
                if block.type != "tool_use":
                    continue
                yield _sse(
                    {"type": "tool_call", "name": block.name, "input": block.input}
                )
                handler = handlers.get(block.name)
                if handler is None:
                    result, ok, summary = (
                        json.dumps({"error": "unknown tool"}),
                        False,
                        "unknown tool",
                    )
                else:
                    try:
                        result = await handler(block.input)
                        ok, summary = True, _summarize(block.name, block.input)
                    except (AgentError, tasks_svc.TaskError, comments_svc.CommentError) as exc:
                        result, ok, summary = json.dumps({"error": str(exc)}), False, str(exc)
                    except Exception as exc:  # noqa: BLE001
                        logger.exception("Agent tool %s failed", block.name)
                        result = json.dumps({"error": "tool failed"})
                        ok, summary = False, "tool failed"
                yield _sse(
                    {"type": "tool_result", "name": block.name, "ok": ok, "summary": summary}
                )
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result,
                        "is_error": not ok,
                    }
                )
            messages.append({"role": "user", "content": tool_results})

        # Persist the thread (prior turns + this assistant reply) so it
        # survives reload / reopen. Best-effort — never break the stream.
        try:
            saved = [{"role": m.role, "content": m.content} for m in thread]
            saved.append({"role": "assistant", "content": assistant_text})
            await agent_store.save_conversation(
                supabase,
                workspace_id=workspace_id,
                project_id=project_id,
                user_id=user_id,
                messages=saved,
            )
        except Exception:  # noqa: BLE001
            logger.exception("Failed to persist agent conversation")

        yield _sse({"type": "done"})
    except Exception as exc:  # noqa: BLE001 — surface a clean error in-stream
        logger.exception("Agent stream failed")
        yield _sse({"type": "error", "message": "The assistant hit an error. Please try again."})


def _summarize(name: str, inp: dict) -> str:
    """Short human-readable summary for the tool-call pill."""
    if name == "create_task":
        return f'Created "{inp.get("title", "")}"'
    if name == "update_task":
        changed = ", ".join(k for k in inp if k != "task")
        return f"Updated {inp.get('task', '')} ({changed})"
    if name == "add_comment":
        return f"Commented on {inp.get('task', '')}"
    if name == "search":
        return f'Searched "{inp.get("query", "")}"'
    if name == "remember":
        return f'Remembered: {inp.get("fact", "")}'
    if name == "forget":
        return "Forgot saved preferences"
    return name.replace("_", " ")
