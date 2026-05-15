from unittest.mock import MagicMock

import pytest

from app.services.activity import (
    ActivityPermissionError,
    TaskNotFoundError,
    list_task_activity,
)


def _activity_row(**over):
    base = {
        "id": "a-1",
        "task_id": "i-1",
        "actor_id": "u-1",
        "action": "status_changed",
        "payload": {"from": "backlog", "to": "in_progress"},
        "created_at": "2026-05-14T00:00:00Z",
    }
    base.update(over)
    return base


def _task_row(**over):
    base = {"id": "i-1", "workspace_id": "ws-1", "project_id": "p-1"}
    base.update(over)
    return base


@pytest.fixture
def mock_supabase():
    return MagicMock()


def test_list_activity_member_ok(mock_supabase):
    tasks_chain = MagicMock()
    tasks_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _task_row()
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"role": "member"}]
    activity_chain = MagicMock()
    activity_chain.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = [
        _activity_row(),
        _activity_row(id="a-2", action="commented"),
    ]

    def table_router(name):
        if name == "tasks":
            return tasks_chain
        if name == "workspace_members":
            return members_chain
        if name == "activity_log":
            return activity_chain
        raise AssertionError(f"unexpected: {name}")

    mock_supabase.table.side_effect = table_router

    result = list_task_activity(mock_supabase, user_id="u-1", task_id="i-1")
    assert len(result) == 2
    assert result[0].action == "status_changed"


def test_list_activity_task_not_found(mock_supabase):
    tasks_chain = MagicMock()
    tasks_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = None

    def table_router(name):
        if name == "tasks":
            return tasks_chain
        raise AssertionError(f"unexpected: {name}")

    mock_supabase.table.side_effect = table_router

    with pytest.raises(TaskNotFoundError):
        list_task_activity(mock_supabase, user_id="u-1", task_id="missing")
