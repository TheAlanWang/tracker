"""Burndown reconstruction from activity_log.

The trigger has written consolidated rows since 20260516120000: action
'updated' with a per-field diff payload ({"status": {"from": ..., "to":
...}}). Rows from before that migration carry the legacy shape: action
'status_changed' with a flat {"from": ..., "to": ...} payload. Burndown
must read both — filtering on the legacy action alone sees zero events
for any modern sprint and mis-drops every done task to the sprint start.
"""

from unittest.mock import MagicMock

import pytest

from app.services.charts import compute_burndown


def _sprint_row(**over):
    base = {
        "id": "s-1",
        "start_at": "2026-07-01",
        "end_at": "2026-07-10",
        "projects": {"workspace_id": "ws-1"},
    }
    base.update(over)
    return base


def _updated_event(task_id, to_status, created_at, from_status="in_progress"):
    """Current trigger shape: consolidated 'updated' row, per-field diffs."""
    return {
        "task_id": task_id,
        "action": "updated",
        "payload": {"status": {"from": from_status, "to": to_status}},
        "created_at": created_at,
    }


def _legacy_event(task_id, to_status, created_at, from_status="in_progress"):
    """Pre-consolidation shape: 'status_changed' row, flat payload."""
    return {
        "task_id": task_id,
        "action": "status_changed",
        "payload": {"from": from_status, "to": to_status},
        "created_at": created_at,
    }


@pytest.fixture
def mock_supabase():
    return MagicMock()


def _wire(mock_supabase, *, sprint, tasks, events):
    sprints_chain = MagicMock()
    sprints_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = sprint
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"role": "member"}]
    tasks_chain = MagicMock()
    tasks_chain.select.return_value.eq.return_value.execute.return_value.data = tasks

    activity_chain = MagicMock()
    events_result = MagicMock()
    events_result.data = events
    # Wire the events onto both query shapes — the legacy single-action
    # filter (.eq) and the both-shapes filter (.in_) — so this test pins
    # down parsing behavior, not the exact query chain.
    activity_chain.select.return_value.in_.return_value.eq.return_value.order.return_value.execute.return_value = events_result
    activity_chain.select.return_value.in_.return_value.in_.return_value.order.return_value.execute.return_value = events_result

    def table_router(name):
        return {
            "sprints": sprints_chain,
            "workspace_members": members_chain,
            "tasks": tasks_chain,
            "activity_log": activity_chain,
        }[name]

    mock_supabase.table.side_effect = table_router


async def test_burndown_reads_consolidated_updated_events(mock_supabase):
    """A task marked done mid-sprint via the current trigger shape must
    burn down on its actual day — not fall back to 'done at start'."""
    _wire(
        mock_supabase,
        sprint=_sprint_row(),
        tasks=[
            {"id": "t-1", "status": "done"},
            {"id": "t-2", "status": "in_progress"},
        ],
        events=[_updated_event("t-1", "done", "2026-07-03T12:00:00Z")],
    )

    result = await compute_burndown(
        mock_supabase, user_id="u-1", sprint_id="s-1", today="2026-07-05"
    )

    by_day = {p.day.isoformat(): p.remaining for p in result.points}
    assert by_day["2026-07-01"] == 2  # nothing done yet
    assert by_day["2026-07-02"] == 2
    assert by_day["2026-07-03"] == 1  # t-1 burned on its actual done day
    assert by_day["2026-07-05"] == 1


async def test_burndown_still_reads_legacy_status_changed_events(mock_supabase):
    _wire(
        mock_supabase,
        sprint=_sprint_row(),
        tasks=[
            {"id": "t-1", "status": "done"},
            {"id": "t-2", "status": "todo"},
        ],
        events=[_legacy_event("t-1", "done", "2026-07-02T08:00:00Z")],
    )

    result = await compute_burndown(
        mock_supabase, user_id="u-1", sprint_id="s-1", today="2026-07-05"
    )

    by_day = {p.day.isoformat(): p.remaining for p in result.points}
    assert by_day["2026-07-01"] == 2
    assert by_day["2026-07-02"] == 1


async def test_burndown_task_leaving_done_clears_marker(mock_supabase):
    """done → back to in_progress (current shape): the done marker is
    cleared, so the task counts as remaining again."""
    _wire(
        mock_supabase,
        sprint=_sprint_row(),
        tasks=[{"id": "t-1", "status": "in_progress"}],
        events=[
            _updated_event("t-1", "done", "2026-07-02T08:00:00Z"),
            _updated_event(
                "t-1", "in_progress", "2026-07-04T08:00:00Z", from_status="done"
            ),
        ],
    )

    result = await compute_burndown(
        mock_supabase, user_id="u-1", sprint_id="s-1", today="2026-07-05"
    )

    by_day = {p.day.isoformat(): p.remaining for p in result.points}
    # Task is not currently done and its marker was cleared → remaining
    # all the way through (the current-status fallback must not re-add it).
    assert by_day["2026-07-05"] == 1


async def test_burndown_updated_event_without_status_change_is_ignored(mock_supabase):
    """Title-only edits also log 'updated' rows — no status key, no effect."""
    _wire(
        mock_supabase,
        sprint=_sprint_row(),
        tasks=[{"id": "t-1", "status": "todo"}],
        events=[
            {
                "task_id": "t-1",
                "action": "updated",
                "payload": {"title": {"from": "a", "to": "b"}},
                "created_at": "2026-07-02T08:00:00Z",
            }
        ],
    )

    result = await compute_burndown(
        mock_supabase, user_id="u-1", sprint_id="s-1", today="2026-07-05"
    )

    by_day = {p.day.isoformat(): p.remaining for p in result.points}
    assert by_day["2026-07-05"] == 1
