from unittest.mock import MagicMock

import pytest
from postgrest.exceptions import APIError

from app.schemas.workspace import WorkspaceCreate
from app.services.workspaces import (
    WorkspaceNotFoundError,
    WorkspacePermissionError,
    WorkspaceSlugExistsError,
    create_workspace,
    delete_workspace,
    get_workspace,
    list_workspaces_for_user,
    update_workspace,
)


def _fake_workspace_row(**overrides):
    base = {
        "id": "ws-1",
        "name": "Engineering",
        "slug": "eng",
        "owner_id": "user-1",
        "created_at": "2026-05-14T00:00:00Z",
        "updated_at": "2026-05-14T00:00:00Z",
    }
    base.update(overrides)
    return base


@pytest.fixture
def mock_supabase():
    """Returns a deeply-mocked supabase client. Use chain helpers below."""
    return MagicMock()


def test_create_workspace_inserts_and_adds_owner_member(mock_supabase):
    payload = WorkspaceCreate(name="Engineering", slug="eng")

    # supabase.table("workspaces").insert(...).execute() returns the new row
    mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [
        _fake_workspace_row()
    ]

    result = create_workspace(mock_supabase, user_id="user-1", payload=payload)

    assert result.id == "ws-1"
    assert result.slug == "eng"
    # Workspace insert + member insert = 2 table accesses
    assert mock_supabase.table.call_count >= 2
    # Verify member row insert
    member_calls = [
        call for call in mock_supabase.table.call_args_list
        if call.args[0] == "workspace_members"
    ]
    assert len(member_calls) == 1


def test_create_workspace_duplicate_slug_raises(mock_supabase):
    payload = WorkspaceCreate(name="X", slug="taken")
    mock_supabase.table.return_value.insert.return_value.execute.side_effect = APIError(
        {"code": "23505", "message": "duplicate key value", "details": "Key (slug)=(taken) already exists."}
    )

    with pytest.raises(WorkspaceSlugExistsError):
        create_workspace(mock_supabase, user_id="user-1", payload=payload)


def test_get_workspace_returns_workspace_if_member(mock_supabase):
    # Membership check returns 1 row
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"role": "member"}
    ]
    # Workspace fetch returns the workspace
    fetch_chain = MagicMock()
    fetch_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _fake_workspace_row()
    mock_supabase.table.side_effect = lambda name: (
        MagicMock(select=MagicMock(return_value=MagicMock(
            eq=MagicMock(return_value=MagicMock(
                eq=MagicMock(return_value=MagicMock(
                    execute=MagicMock(return_value=MagicMock(data=[{"role": "member"}]))
                )),
                single=MagicMock(return_value=MagicMock(
                    execute=MagicMock(return_value=MagicMock(data=_fake_workspace_row()))
                )),
            ))
        ))) if name in ("workspace_members", "workspaces") else MagicMock()
    )

    result = get_workspace(mock_supabase, user_id="user-1", workspace_id="ws-1")
    assert result.id == "ws-1"


def test_list_workspaces_for_user_returns_users_workspaces(mock_supabase):
    # Membership query returns list of workspace_ids
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {"workspace_id": "ws-1"},
        {"workspace_id": "ws-2"},
    ]
    # Workspaces lookup returns 2 rows
    workspaces_query = MagicMock()
    workspaces_query.select.return_value.in_.return_value.execute.return_value.data = [
        _fake_workspace_row(id="ws-1", slug="a"),
        _fake_workspace_row(id="ws-2", slug="b"),
    ]
    def table_router(name):
        if name == "workspace_members":
            return mock_supabase.table.return_value
        if name == "workspaces":
            return workspaces_query
        raise AssertionError(f"unexpected table: {name}")
    mock_supabase.table.side_effect = table_router

    result = list_workspaces_for_user(mock_supabase, user_id="user-1")
    assert len(result) == 2
    assert {w.slug for w in result} == {"a", "b"}


def test_update_workspace_happy_path(mock_supabase):
    """Owner can update workspace name — returns updated workspace."""
    fetched_chain = MagicMock()
    fetched_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
        _fake_workspace_row(owner_id="user-1")
    )
    update_chain = MagicMock()
    update_chain.update.return_value.eq.return_value.execute.return_value.data = [
        _fake_workspace_row(owner_id="user-1", name="Renamed")
    ]

    calls = {"workspaces_count": 0}

    def table_router(name):
        if name == "workspaces":
            calls["workspaces_count"] += 1
            # First call: fetch. Second call: update.
            return fetched_chain if calls["workspaces_count"] == 1 else update_chain
        raise AssertionError(f"unexpected table: {name}")

    mock_supabase.table.side_effect = table_router

    from app.schemas.workspace import WorkspaceUpdate
    result = update_workspace(
        mock_supabase, user_id="user-1", workspace_id="ws-1",
        payload=WorkspaceUpdate(name="Renamed"),
    )
    assert result.name == "Renamed"


def test_update_workspace_empty_payload_returns_unchanged(mock_supabase):
    """Empty WorkspaceUpdate skips the update DB call."""
    mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
        _fake_workspace_row(owner_id="user-1")
    )

    from app.schemas.workspace import WorkspaceUpdate
    result = update_workspace(
        mock_supabase, user_id="user-1", workspace_id="ws-1",
        payload=WorkspaceUpdate(),  # nothing set
    )
    assert result.id == "ws-1"
    # No `.update(...)` call should have been chained
    update_calls = [
        c for c in mock_supabase.method_calls
        if c[0] == "table().update"
    ]
    assert update_calls == []


def test_delete_workspace_happy_path(mock_supabase):
    """Owner deletes — no exception, returns None."""
    select_chain = MagicMock()
    select_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
        {"owner_id": "user-1"}
    )
    delete_chain = MagicMock()
    delete_chain.delete.return_value.eq.return_value.execute.return_value.data = []

    calls = {"count": 0}

    def table_router(name):
        assert name == "workspaces"
        calls["count"] += 1
        return select_chain if calls["count"] == 1 else delete_chain

    mock_supabase.table.side_effect = table_router

    result = delete_workspace(mock_supabase, user_id="user-1", workspace_id="ws-1")
    assert result is None
