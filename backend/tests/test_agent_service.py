import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.plan_limits import get_limit
from app.schemas.task import TaskResponse
from app.services.agent import AgentError, _resolve_task_id, _summarize
from app.services.usage import (
    AgentQuotaExceededError,
    AgentUsage,
    consume_agent_message,
)


def _workspace_plan_chain(plan: str) -> MagicMock:
    chain = MagicMock()
    (
        chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data
    ) = {"plan": plan}
    return chain


# ── usage / metering ─────────────────────────────────────────────────────


async def test_consume_agent_message_allows_under_cap():
    supabase = MagicMock()
    ws_chain = _workspace_plan_chain("free")
    supabase.table.side_effect = lambda name: {"workspaces": ws_chain}[name]
    # RPC returns the single-row table the SQL function produces.
    supabase.rpc.return_value.execute.return_value.data = [
        {"allowed": True, "used": 1}
    ]

    free_cap = get_limit("free", "agent_messages_per_month")
    usage = await consume_agent_message(supabase, workspace_id="ws-1")

    assert isinstance(usage, AgentUsage)
    assert usage.used == 1
    assert usage.cap == free_cap  # read from plan_limits, not hardcoded
    assert usage.remaining == free_cap - 1
    # The cap is passed to the RPC so the increment is gated atomically.
    assert supabase.rpc.call_args.args[0] == "consume_agent_message"
    assert supabase.rpc.call_args.args[1] == {
        "p_workspace_id": "ws-1",
        "p_limit": free_cap,
    }


async def test_consume_agent_message_raises_over_cap():
    supabase = MagicMock()
    ws_chain = _workspace_plan_chain("free")
    supabase.table.side_effect = lambda name: {"workspaces": ws_chain}[name]
    free_cap = get_limit("free", "agent_messages_per_month")
    supabase.rpc.return_value.execute.return_value.data = [
        {"allowed": False, "used": free_cap}
    ]

    with pytest.raises(AgentQuotaExceededError) as exc:
        await consume_agent_message(supabase, workspace_id="ws-1")
    assert exc.value.plan == "free"
    assert exc.value.cap == free_cap
    assert exc.value.used == free_cap


async def test_consume_agent_message_pro_uses_pro_cap():
    supabase = MagicMock()
    ws_chain = _workspace_plan_chain("pro")
    supabase.table.side_effect = lambda name: {"workspaces": ws_chain}[name]
    supabase.rpc.return_value.execute.return_value.data = [
        {"allowed": True, "used": 1}
    ]

    usage = await consume_agent_message(supabase, workspace_id="ws-1")
    assert usage.cap == get_limit("pro", "agent_messages_per_month")


# ── project-bound task resolution ──────────────────────────────────────────


async def test_resolve_task_id_resolves_identifier_in_project():
    supabase = MagicMock()
    chain = supabase.table.return_value
    (
        chain.select.return_value.eq.return_value.ilike.return_value.limit.return_value.execute.return_value.data
    ) = [{"id": "task-uuid"}]

    task_id = await _resolve_task_id(supabase, project_id="p-1", ref="RAG-6")
    assert task_id == "task-uuid"


async def test_resolve_task_id_rejects_ref_not_in_project():
    supabase = MagicMock()
    chain = supabase.table.return_value
    # No row → the ref doesn't belong to the bound project.
    (
        chain.select.return_value.eq.return_value.ilike.return_value.limit.return_value.execute.return_value.data
    ) = []

    with pytest.raises(AgentError):
        await _resolve_task_id(supabase, project_id="p-1", ref="OTHER-9")


# ── summaries (pure) ───────────────────────────────────────────────────────


def test_summarize_variants():
    assert "create" in _summarize("create_task", {"title": "Ship it"}).lower()
    assert "RAG-6" in _summarize("update_task", {"task": "RAG-6", "status": "done"})
    assert _summarize("list_tasks", {}) == "list tasks"
    assert "Remembered" in _summarize("remember", {"fact": "likes high priority"})
    assert "RAG-6" in _summarize("list_comments", {"task": "RAG-6"})
    # delete_comment label reflects whether it's the guard call or the real delete
    assert _summarize("delete_comment", {"comment_id": "c-1"}) == "Reviewing comment to delete"
    assert _summarize("delete_comment", {"comment_id": "c-1", "confirm": True}) == "Deleted a comment"


# ── comment tools: list + two-step delete ─────────────────────────────────


def _handlers():
    from app.services.agent import _build_handlers

    return _build_handlers(
        MagicMock(), user_id="u-1", project_id="p-1",
        workspace_id="ws-1", ws_slug="trackly",
    )


async def test_list_comments_flags_own_comments():
    from app.schemas.comment import CommentResponse

    rows = [
        CommentResponse(id="c-1", task_id="t-1", author_id="u-1", body="mine",
                        created_at="2026-06-15T00:00:00Z", updated_at="2026-06-15T00:00:00Z"),
        CommentResponse(id="c-2", task_id="t-1", author_id="u-2", body="theirs",
                        created_at="2026-06-15T00:00:00Z", updated_at="2026-06-15T00:00:00Z"),
    ]
    with patch("app.services.agent._resolve_task_id", new=AsyncMock(return_value="t-1")), \
         patch("app.services.agent.comments_svc.list_comments", new=AsyncMock(return_value=rows)):
        out = json.loads(await _handlers()["list_comments"]({"task": "RAG-6"}))

    assert [c["id"] for c in out] == ["c-1", "c-2"]
    assert out[0]["mine"] is True and out[1]["mine"] is False


async def test_delete_comment_guard_does_not_delete_without_confirm():
    delete = AsyncMock()
    with patch("app.services.agent.comments_svc.delete_comment", new=delete):
        out = json.loads(await _handlers()["delete_comment"]({"comment_id": "c-1"}))

    assert out["requires_confirmation"] is True
    assert out["comment_id"] == "c-1"
    delete.assert_not_awaited()  # nothing deleted on the guard call


async def test_delete_comment_deletes_with_confirm():
    delete = AsyncMock()
    with patch("app.services.agent.comments_svc.delete_comment", new=delete):
        out = json.loads(
            await _handlers()["delete_comment"]({"comment_id": "c-1", "confirm": True})
        )

    assert out == {"ok": True, "deleted_comment_id": "c-1"}
    delete.assert_awaited_once()
    assert delete.await_args.kwargs == {"user_id": "u-1", "comment_id": "c-1"}


# ── long-term memory store ─────────────────────────────────────────────────


async def test_add_memory_inserts_when_under_cap():
    from app.services import agent_store

    supabase = MagicMock()
    tbl = supabase.table.return_value
    (
        tbl.select.return_value.eq.return_value.eq.return_value.order.return_value.execute.return_value.data
    ) = [{"id": "m1"}]  # only one existing, well under cap

    await agent_store.add_memory(
        supabase, workspace_id="ws", user_id="u", content="prefers high priority"
    )

    tbl.insert.assert_called_once()
    tbl.delete.assert_not_called()  # no eviction needed


async def test_add_memory_evicts_oldest_at_cap():
    from app.services import agent_store

    supabase = MagicMock()
    tbl = supabase.table.return_value
    # At the cap (40) → adding one must evict the oldest to make room.
    (
        tbl.select.return_value.eq.return_value.eq.return_value.order.return_value.execute.return_value.data
    ) = [{"id": f"m{i}"} for i in range(40)]

    await agent_store.add_memory(
        supabase, workspace_id="ws", user_id="u", content="new fact"
    )

    tbl.delete.assert_called()  # oldest dropped
    tbl.insert.assert_called_once()


async def test_add_memory_skips_empty():
    from app.services import agent_store

    supabase = MagicMock()
    await agent_store.add_memory(
        supabase, workspace_id="ws", user_id="u", content="   "
    )
    supabase.table.return_value.insert.assert_not_called()


# ── page context: focus_task ─────────────────────────────────────────────


def _focus_task(identifier="RAG-10", **over):
    base = dict(
        id="t-1", workspace_id="ws-1", project_id="p-1", sprint_id=None,
        parent_id=None, identifier=identifier, title="Wire OAuth",
        description="Hook up the OAuth client metadata.", status="in_progress",
        priority="high", assignee_id=None, reporter_id="u-1", due_date=None,
        position=0.0, created_at="2026-05-14T00:00:00Z",
        updated_at="2026-05-14T00:00:00Z",
    )
    base.update(over)
    return TaskResponse(**base)


_FOCUS_PROJECT = {
    "id": "p-1", "workspace_id": "ws-1", "name": "Trackly", "key": "RAG",
}


async def test_page_context_includes_focus_block():
    from app.services.agent import _build_page_context

    with patch("app.services.agent.tasks_svc.list_tasks",
               new=AsyncMock(return_value=[_focus_task()])), \
         patch("app.services.agent._caller_identity",
               new=AsyncMock(return_value="You are talking to (user_id: u-1).")):
        ctx = await _build_page_context(
            MagicMock(), user_id="u-1", project=_FOCUS_PROJECT,
            project_id="p-1", focus_task="RAG-10",
        )

    assert "currently viewing task RAG-10" in ctx
    assert "Hook up the OAuth client metadata." in ctx


async def test_page_context_no_focus_unchanged():
    from app.services.agent import _build_page_context

    with patch("app.services.agent.tasks_svc.list_tasks",
               new=AsyncMock(return_value=[_focus_task()])), \
         patch("app.services.agent._caller_identity",
               new=AsyncMock(return_value="You are talking to (user_id: u-1).")):
        ctx = await _build_page_context(
            MagicMock(), user_id="u-1", project=_FOCUS_PROJECT, project_id="p-1",
        )

    assert "currently viewing task" not in ctx


async def test_page_context_unresolvable_focus_falls_back():
    from app.services.agent import _build_page_context

    with patch("app.services.agent.tasks_svc.list_tasks",
               new=AsyncMock(return_value=[_focus_task()])), \
         patch("app.services.agent._caller_identity",
               new=AsyncMock(return_value="You are talking to (user_id: u-1).")):
        ctx = await _build_page_context(
            MagicMock(), user_id="u-1", project=_FOCUS_PROJECT,
            project_id="p-1", focus_task="RAG-999",
        )

    assert "currently viewing task" not in ctx
