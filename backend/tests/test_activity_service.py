from unittest.mock import MagicMock

import pytest

from app.services.activity import (
    ActivityPermissionError,
    IssueNotFoundError,
    list_issue_activity,
)


def _activity_row(**over):
    base = {
        "id": "a-1",
        "issue_id": "i-1",
        "actor_id": "u-1",
        "action": "status_changed",
        "payload": {"from": "backlog", "to": "in_progress"},
        "created_at": "2026-05-14T00:00:00Z",
    }
    base.update(over)
    return base


def _issue_row(**over):
    base = {"id": "i-1", "workspace_id": "ws-1", "project_id": "p-1"}
    base.update(over)
    return base


@pytest.fixture
def mock_supabase():
    return MagicMock()


def test_list_activity_member_ok(mock_supabase):
    issues_chain = MagicMock()
    issues_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _issue_row()
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"role": "member"}]
    activity_chain = MagicMock()
    activity_chain.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = [
        _activity_row(),
        _activity_row(id="a-2", action="commented"),
    ]

    def table_router(name):
        if name == "issues":
            return issues_chain
        if name == "workspace_members":
            return members_chain
        if name == "activity_log":
            return activity_chain
        raise AssertionError(f"unexpected: {name}")

    mock_supabase.table.side_effect = table_router

    result = list_issue_activity(mock_supabase, user_id="u-1", issue_id="i-1")
    assert len(result) == 2
    assert result[0].action == "status_changed"


def test_list_activity_issue_not_found(mock_supabase):
    issues_chain = MagicMock()
    issues_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = None

    def table_router(name):
        if name == "issues":
            return issues_chain
        raise AssertionError(f"unexpected: {name}")

    mock_supabase.table.side_effect = table_router

    with pytest.raises(IssueNotFoundError):
        list_issue_activity(mock_supabase, user_id="u-1", issue_id="missing")


def test_list_activity_non_member_raises(mock_supabase):
    issues_chain = MagicMock()
    issues_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _issue_row()
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []

    def table_router(name):
        if name == "issues":
            return issues_chain
        if name == "workspace_members":
            return members_chain
        raise AssertionError(f"unexpected: {name}")

    mock_supabase.table.side_effect = table_router

    with pytest.raises(ActivityPermissionError):
        list_issue_activity(mock_supabase, user_id="u-1", issue_id="i-1")
