from unittest.mock import MagicMock

import pytest
from postgrest.exceptions import APIError

from app.schemas.label import LabelCreate
from app.services.labels import (
    IssueNotFoundError,
    LabelNameExistsError,
    LabelNotFoundError,
    LabelPermissionError,
    attach_label,
    create_label,
    delete_label,
    detach_label,
    list_issue_labels,
    list_labels,
)


def _label(**over):
    base = {"id": "l-1", "workspace_id": "ws-1", "name": "bug", "color": "#ff0000", "created_at": "2026-05-14T00:00:00Z"}
    base.update(over)
    return base


@pytest.fixture
def mock_supabase():
    return MagicMock()


def test_list_labels_member_ok(mock_supabase):
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"role": "member"}]
    labels_chain = MagicMock()
    labels_chain.select.return_value.eq.return_value.order.return_value.execute.return_value.data = [_label(), _label(id="l-2", name="enhancement")]
    def tr(name):
        if name == "workspace_members": return members_chain
        if name == "labels": return labels_chain
        raise AssertionError(name)
    mock_supabase.table.side_effect = tr
    result = list_labels(mock_supabase, user_id="u-1", workspace_id="ws-1")
    assert len(result) == 2


def test_create_label_happy(mock_supabase):
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"role": "member"}]
    labels_chain = MagicMock()
    labels_chain.insert.return_value.execute.return_value.data = [_label(name="urgent")]
    def tr(name):
        if name == "workspace_members": return members_chain
        if name == "labels": return labels_chain
        raise AssertionError(name)
    mock_supabase.table.side_effect = tr
    result = create_label(mock_supabase, user_id="u-1", workspace_id="ws-1", payload=LabelCreate(name="urgent", color="#ff0000"))
    assert result.name == "urgent"


def test_create_label_duplicate_name_raises(mock_supabase):
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"role": "member"}]
    labels_chain = MagicMock()
    labels_chain.insert.return_value.execute.side_effect = APIError({"code": "23505", "message": "duplicate", "details": None})
    def tr(name):
        if name == "workspace_members": return members_chain
        if name == "labels": return labels_chain
        raise AssertionError(name)
    mock_supabase.table.side_effect = tr
    with pytest.raises(LabelNameExistsError):
        create_label(mock_supabase, user_id="u-1", workspace_id="ws-1", payload=LabelCreate(name="bug", color="#ff0000"))


def test_attach_label_cross_workspace_raises(mock_supabase):
    issues_chain = MagicMock()
    issues_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {"workspace_id": "ws-1"}
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"role": "member"}]
    labels_chain = MagicMock()
    labels_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {"workspace_id": "ws-OTHER"}
    def tr(name):
        if name == "issues": return issues_chain
        if name == "workspace_members": return members_chain
        if name == "labels": return labels_chain
        raise AssertionError(name)
    mock_supabase.table.side_effect = tr
    with pytest.raises(LabelNotFoundError):
        attach_label(mock_supabase, user_id="u-1", issue_id="i-1", label_id="l-1")


def test_attach_label_duplicate_is_idempotent(mock_supabase):
    issues_chain = MagicMock()
    issues_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {"workspace_id": "ws-1"}
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"role": "member"}]
    labels_chain = MagicMock()
    labels_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {"workspace_id": "ws-1"}
    rel_chain = MagicMock()
    rel_chain.insert.return_value.execute.side_effect = APIError({"code": "23505", "message": "dup", "details": None})
    def tr(name):
        if name == "issues": return issues_chain
        if name == "workspace_members": return members_chain
        if name == "labels": return labels_chain
        if name == "issue_labels": return rel_chain
        raise AssertionError(name)
    mock_supabase.table.side_effect = tr
    # Should not raise
    result = attach_label(mock_supabase, user_id="u-1", issue_id="i-1", label_id="l-1")
    assert result is None


def test_detach_label_happy(mock_supabase):
    issues_chain = MagicMock()
    issues_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {"workspace_id": "ws-1"}
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"role": "member"}]
    rel_chain = MagicMock()
    rel_chain.delete.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
    def tr(name):
        if name == "issues": return issues_chain
        if name == "workspace_members": return members_chain
        if name == "issue_labels": return rel_chain
        raise AssertionError(name)
    mock_supabase.table.side_effect = tr
    result = detach_label(mock_supabase, user_id="u-1", issue_id="i-1", label_id="l-1")
    assert result is None
