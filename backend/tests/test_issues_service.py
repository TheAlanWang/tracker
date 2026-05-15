from datetime import datetime
from unittest.mock import MagicMock

import pytest

from app.schemas.issue import IssueCreate, IssueUpdate
from app.services.issues import (
    IssueNotFoundError,
    IssuePermissionError,
    ProjectNotFoundError,
    create_issue,
    delete_issue,
    get_issue,
    list_issues,
    update_issue,
)


def _issue_row(**over):
    base = {
        "id": "i-1",
        "workspace_id": "ws-1",
        "project_id": "p-1",
        "sprint_id": None,
        "parent_id": None,
        "identifier": "BE-1",
        "title": "Test issue",
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
        "next_issue_number": 1,
        "description": None,
        "created_at": "2026-05-14T00:00:00Z",
        "updated_at": "2026-05-14T00:00:00Z",
    }
    base.update(over)
    return base


@pytest.fixture
def mock_supabase():
    return MagicMock()


def test_create_issue_calls_rpc_with_membership_check(mock_supabase):
    """Service: verify membership → fetch project → call RPC → return."""
    # Membership check chain (workspace_members)
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"role": "member"}
    ]
    # Project fetch chain
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
    mock_supabase.rpc.return_value.execute.return_value.data = _issue_row()

    result = create_issue(
        mock_supabase,
        user_id="u-1",
        project_id="p-1",
        payload=IssueCreate(title="Test issue"),
    )

    assert result.identifier == "BE-1"
    mock_supabase.rpc.assert_called_once()
    args, kwargs = mock_supabase.rpc.call_args
    assert args[0] == "create_issue_with_identifier"
    # Verify reporter_id is the caller and workspace_id is from project
    rpc_args = args[1]
    assert rpc_args["p_reporter_id"] == "u-1"
    assert rpc_args["p_workspace_id"] == "ws-1"
    assert rpc_args["p_project_id"] == "p-1"
    assert rpc_args["p_title"] == "Test issue"


def test_create_issue_non_member_raises(mock_supabase):
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

    with pytest.raises(IssuePermissionError):
        create_issue(
            mock_supabase,
            user_id="u-1",
            project_id="p-1",
            payload=IssueCreate(title="Test"),
        )
    mock_supabase.rpc.assert_not_called()


def test_create_issue_project_not_found(mock_supabase):
    project_chain = MagicMock()
    project_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = None

    def table_router(name):
        if name == "projects":
            return project_chain
        raise AssertionError(f"unexpected table: {name}")

    mock_supabase.table.side_effect = table_router

    with pytest.raises(ProjectNotFoundError):
        create_issue(
            mock_supabase,
            user_id="u-1",
            project_id="missing",
            payload=IssueCreate(title="Test"),
        )


def test_list_issues_filters_by_status(mock_supabase):
    project_chain = MagicMock()
    project_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
        _project_row()
    )
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"role": "member"}
    ]
    issues_chain = MagicMock()
    issues_chain.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = [
        _issue_row(identifier="BE-1", status="todo"),
        _issue_row(id="i-2", identifier="BE-2", status="todo"),
    ]

    def table_router(name):
        if name == "projects":
            return project_chain
        if name == "workspace_members":
            return members_chain
        if name == "issues":
            return issues_chain
        raise AssertionError(f"unexpected table: {name}")

    mock_supabase.table.side_effect = table_router

    result = list_issues(
        mock_supabase, user_id="u-1", project_id="p-1", status="todo"
    )
    assert len(result) == 2
    assert all(i.status == "todo" for i in result)


def test_list_issues_no_filter(mock_supabase):
    project_chain = MagicMock()
    project_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
        _project_row()
    )
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"role": "member"}
    ]
    issues_chain = MagicMock()
    issues_chain.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = [
        _issue_row()
    ]

    def table_router(name):
        if name == "projects":
            return project_chain
        if name == "workspace_members":
            return members_chain
        if name == "issues":
            return issues_chain
        raise AssertionError(f"unexpected table: {name}")

    mock_supabase.table.side_effect = table_router

    result = list_issues(mock_supabase, user_id="u-1", project_id="p-1")
    assert len(result) == 1


def test_get_issue_member_ok(mock_supabase):
    issues_chain = MagicMock()
    issues_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
        _issue_row()
    )
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"role": "member"}
    ]

    def table_router(name):
        if name == "issues":
            return issues_chain
        if name == "workspace_members":
            return members_chain
        raise AssertionError(f"unexpected table: {name}")

    mock_supabase.table.side_effect = table_router

    result = get_issue(mock_supabase, user_id="u-1", issue_id="i-1")
    assert result.id == "i-1"


def test_get_issue_not_found(mock_supabase):
    issues_chain = MagicMock()
    issues_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = None

    def table_router(name):
        if name == "issues":
            return issues_chain
        raise AssertionError(f"unexpected table: {name}")

    mock_supabase.table.side_effect = table_router

    with pytest.raises(IssueNotFoundError):
        get_issue(mock_supabase, user_id="u-1", issue_id="missing")


def test_get_issue_non_member_raises(mock_supabase):
    issues_chain = MagicMock()
    issues_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
        _issue_row()
    )
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []

    def table_router(name):
        if name == "issues":
            return issues_chain
        if name == "workspace_members":
            return members_chain
        raise AssertionError(f"unexpected table: {name}")

    mock_supabase.table.side_effect = table_router

    with pytest.raises(IssuePermissionError):
        get_issue(mock_supabase, user_id="u-1", issue_id="i-1")


def test_update_issue_partial_only(mock_supabase):
    """PATCH with only title set should only update title."""
    issues_chain_fetch = MagicMock()
    issues_chain_fetch.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
        _issue_row()
    )
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"role": "member"}
    ]
    issues_chain_update = MagicMock()
    issues_chain_update.update.return_value.eq.return_value.execute.return_value.data = [
        _issue_row(title="Updated")
    ]

    call_count = {"issues": 0}

    def table_router(name):
        if name == "issues":
            call_count["issues"] += 1
            return issues_chain_fetch if call_count["issues"] == 1 else issues_chain_update
        if name == "workspace_members":
            return members_chain
        raise AssertionError(f"unexpected table: {name}")

    mock_supabase.table.side_effect = table_router

    result = update_issue(
        mock_supabase,
        user_id="u-1",
        issue_id="i-1",
        payload=IssueUpdate(title="Updated"),
    )
    assert result.title == "Updated"
    # Verify the update call only included `title`
    update_args = issues_chain_update.update.call_args[0][0]
    assert update_args == {"title": "Updated"}


def test_update_issue_empty_payload_returns_unchanged(mock_supabase):
    issues_chain = MagicMock()
    issues_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
        _issue_row()
    )
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"role": "member"}
    ]

    def table_router(name):
        if name == "issues":
            return issues_chain
        if name == "workspace_members":
            return members_chain
        raise AssertionError(f"unexpected table: {name}")

    mock_supabase.table.side_effect = table_router

    result = update_issue(
        mock_supabase,
        user_id="u-1",
        issue_id="i-1",
        payload=IssueUpdate(),  # nothing set
    )
    assert result.id == "i-1"
    # No .update(...) chain should have been invoked
    update_calls = [
        c for c in mock_supabase.method_calls if c[0] == "table().update"
    ]
    assert update_calls == []


def test_delete_issue_happy_path(mock_supabase):
    issues_chain_fetch = MagicMock()
    issues_chain_fetch.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
        _issue_row()
    )
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"role": "member"}
    ]
    issues_chain_delete = MagicMock()
    issues_chain_delete.delete.return_value.eq.return_value.execute.return_value.data = []

    call_count = {"issues": 0}

    def table_router(name):
        if name == "issues":
            call_count["issues"] += 1
            return issues_chain_fetch if call_count["issues"] == 1 else issues_chain_delete
        if name == "workspace_members":
            return members_chain
        raise AssertionError(f"unexpected table: {name}")

    mock_supabase.table.side_effect = table_router

    result = delete_issue(mock_supabase, user_id="u-1", issue_id="i-1")
    assert result is None
