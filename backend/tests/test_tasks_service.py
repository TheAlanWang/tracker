from unittest.mock import MagicMock

import pytest

from app.schemas.task import TaskCreate, TaskUpdate
from app.services.tasks import (
    TaskNotFoundError,
    TaskPermissionError,
    ProjectNotFoundError,
    create_task,
    delete_task,
    get_task,
    list_tasks,
    move_task,
    update_task,
)


def _task_row(**over):
    base = {
        "id": "i-1",
        "workspace_id": "ws-1",
        "project_id": "p-1",
        "sprint_id": None,
        "parent_id": None,
        "identifier": "BE-1",
        "title": "Test task",
        "description": "",
        "status": "backlog",
        "priority": "no_priority",
        "assignee_id": None,
        "reporter_id": "u-1",
        "due_date": None,
        "position": 0.0,
        "created_at": "2026-05-14T00:00:00Z",
        "updated_at": "2026-05-14T00:00:00Z",
    }
    base.update(over)
    return base


def _project_row(**over):
    base = {
        "id": "p-1",
        "workspace_id": "ws-1",
        "name": "Backend",
        "key": "BE",
        "next_task_number": 1,
        "description": None,
        "created_at": "2026-05-14T00:00:00Z",
        "updated_at": "2026-05-14T00:00:00Z",
    }
    base.update(over)
    return base


@pytest.fixture
def mock_supabase():
    return MagicMock()


def test_create_task_calls_rpc_with_membership_check(mock_supabase):
    """Service: verify membership → fetch project → call RPC → return."""
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"role": "member"}
    ]
    project_chain = MagicMock()
    project_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
        _project_row()
    )

    def table_router(name):
        if name == "workspace_members":
            return members_chain
        if name == "projects":
            return project_chain
        raise AssertionError(f"unexpected table: {name}")

    mock_supabase.table.side_effect = table_router
    mock_supabase.rpc.return_value.execute.return_value.data = _task_row()

    result = create_task(
        mock_supabase,
        user_id="u-1",
        project_id="p-1",
        payload=TaskCreate(title="Test task"),
    )

    assert result.identifier == "BE-1"
    mock_supabase.rpc.assert_called_once()
    args, kwargs = mock_supabase.rpc.call_args
    assert args[0] == "create_task_with_identifier"
    rpc_args = args[1]
    assert rpc_args["p_reporter_id"] == "u-1"
    assert rpc_args["p_workspace_id"] == "ws-1"
    assert rpc_args["p_project_id"] == "p-1"
    assert rpc_args["p_title"] == "Test task"


def test_create_task_non_member_raises(mock_supabase):
    project_chain = MagicMock()
    project_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
        _project_row()
    )
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []

    def table_router(name):
        if name == "projects":
            return project_chain
        if name == "workspace_members":
            return members_chain
        raise AssertionError(f"unexpected table: {name}")

    mock_supabase.table.side_effect = table_router

    with pytest.raises(TaskPermissionError):
        create_task(
            mock_supabase,
            user_id="u-1",
            project_id="p-1",
            payload=TaskCreate(title="Test"),
        )
    mock_supabase.rpc.assert_not_called()


def test_list_tasks_no_filter(mock_supabase):
    project_chain = MagicMock()
    project_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
        _project_row()
    )
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"role": "member"}
    ]
    tasks_chain = MagicMock()
    tasks_chain.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = [
        _task_row()
    ]

    def table_router(name):
        if name == "projects":
            return project_chain
        if name == "workspace_members":
            return members_chain
        if name == "tasks":
            return tasks_chain
        raise AssertionError(f"unexpected table: {name}")

    mock_supabase.table.side_effect = table_router

    result = list_tasks(mock_supabase, user_id="u-1", project_id="p-1")
    assert len(result) == 1


def test_list_tasks_filters_by_sprint_null(mock_supabase):
    """sprint='null' filters tasks with sprint_id IS NULL (backlog)."""
    project_chain = MagicMock()
    project_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _project_row()
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"role": "member"}]
    tasks_chain = MagicMock()
    tasks_chain.select.return_value.eq.return_value.is_.return_value.order.return_value.limit.return_value.execute.return_value.data = [
        _task_row(sprint_id=None)
    ]

    def table_router(name):
        if name == "projects": return project_chain
        if name == "workspace_members": return members_chain
        if name == "tasks": return tasks_chain
        raise AssertionError(f"unexpected: {name}")
    mock_supabase.table.side_effect = table_router

    result = list_tasks(mock_supabase, user_id="u-1", project_id="p-1", sprint="null")
    assert len(result) == 1
    # Verify .is_("sprint_id", None) was called
    tasks_chain.select.return_value.eq.return_value.is_.assert_called_with("sprint_id", "null")


def test_get_task_member_ok(mock_supabase):
    tasks_chain = MagicMock()
    tasks_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
        _task_row()
    )
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"role": "member"}
    ]

    def table_router(name):
        if name == "tasks":
            return tasks_chain
        if name == "workspace_members":
            return members_chain
        raise AssertionError(f"unexpected table: {name}")

    mock_supabase.table.side_effect = table_router

    result = get_task(mock_supabase, user_id="u-1", task_id="i-1")
    assert result.id == "i-1"


def test_update_task_partial_only(mock_supabase):
    """PATCH with only title set should only update title."""
    tasks_chain_fetch = MagicMock()
    tasks_chain_fetch.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
        _task_row()
    )
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"role": "member"}
    ]
    tasks_chain_update = MagicMock()
    tasks_chain_update.update.return_value.eq.return_value.execute.return_value.data = [
        _task_row(title="Updated")
    ]

    call_count = {"tasks": 0}

    def table_router(name):
        if name == "tasks":
            call_count["tasks"] += 1
            return tasks_chain_fetch if call_count["tasks"] == 1 else tasks_chain_update
        if name == "workspace_members":
            return members_chain
        raise AssertionError(f"unexpected table: {name}")

    mock_supabase.table.side_effect = table_router

    result = update_task(
        mock_supabase,
        user_id="u-1",
        task_id="i-1",
        payload=TaskUpdate(title="Updated"),
    )
    assert result.title == "Updated"
    # Verify the update call only included `title`
    update_args = tasks_chain_update.update.call_args[0][0]
    assert update_args == {"title": "Updated"}


def test_update_task_empty_payload_returns_unchanged(mock_supabase):
    tasks_chain = MagicMock()
    tasks_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
        _task_row()
    )
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"role": "member"}
    ]

    def table_router(name):
        if name == "tasks":
            return tasks_chain
        if name == "workspace_members":
            return members_chain
        raise AssertionError(f"unexpected table: {name}")

    mock_supabase.table.side_effect = table_router

    result = update_task(
        mock_supabase,
        user_id="u-1",
        task_id="i-1",
        payload=TaskUpdate(),  # nothing set
    )
    assert result.id == "i-1"
    # No .update(...) chain should have been invoked
    update_calls = [
        c for c in mock_supabase.method_calls if c[0] == "table().update"
    ]
    assert update_calls == []


def test_delete_task_happy_path(mock_supabase):
    tasks_chain_fetch = MagicMock()
    tasks_chain_fetch.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
        _task_row()
    )
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"role": "member"}
    ]
    tasks_chain_delete = MagicMock()
    tasks_chain_delete.delete.return_value.eq.return_value.execute.return_value.data = []

    call_count = {"tasks": 0}

    def table_router(name):
        if name == "tasks":
            call_count["tasks"] += 1
            return tasks_chain_fetch if call_count["tasks"] == 1 else tasks_chain_delete
        if name == "workspace_members":
            return members_chain
        raise AssertionError(f"unexpected table: {name}")

    mock_supabase.table.side_effect = table_router

    result = delete_task(mock_supabase, user_id="u-1", task_id="i-1")
    assert result is None
