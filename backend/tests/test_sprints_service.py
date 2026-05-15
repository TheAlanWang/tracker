from unittest.mock import MagicMock

import pytest

from app.schemas.sprint import SprintCreate, SprintUpdate
from app.services.sprints import (
    AnotherActiveSprintError,
    ProjectNotFoundError,
    SprintInvalidTransitionError,
    SprintNotFoundError,
    SprintPermissionError,
    complete_sprint,
    create_sprint,
    delete_sprint,
    get_sprint,
    list_sprints,
    start_sprint,
    update_sprint,
)


def _sprint_row(**over):
    base = {
        "id": "s-1",
        "project_id": "p-1",
        "name": "Sprint 1",
        "status": "planned",
        "start_at": None,
        "end_at": None,
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


def test_create_sprint_happy_path(mock_supabase):
    project_chain = MagicMock()
    project_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _project_row()
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"role": "member"}]
    sprints_chain = MagicMock()
    sprints_chain.insert.return_value.execute.return_value.data = [_sprint_row(name="My sprint")]

    def table_router(name):
        if name == "projects": return project_chain
        if name == "workspace_members": return members_chain
        if name == "sprints": return sprints_chain
        raise AssertionError(f"unexpected: {name}")
    mock_supabase.table.side_effect = table_router

    result = create_sprint(
        mock_supabase, user_id="u-1", project_id="p-1",
        payload=SprintCreate(name="My sprint"),
    )
    assert result.name == "My sprint"
    assert result.status == "planned"


def test_create_sprint_non_member_raises(mock_supabase):
    project_chain = MagicMock()
    project_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _project_row()
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []

    def table_router(name):
        if name == "projects": return project_chain
        if name == "workspace_members": return members_chain
        raise AssertionError(f"unexpected: {name}")
    mock_supabase.table.side_effect = table_router

    with pytest.raises(SprintPermissionError):
        create_sprint(mock_supabase, user_id="u-1", project_id="p-1", payload=SprintCreate(name="X"))


def test_create_sprint_project_not_found(mock_supabase):
    project_chain = MagicMock()
    project_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = None

    def table_router(name):
        if name == "projects": return project_chain
        raise AssertionError(f"unexpected: {name}")
    mock_supabase.table.side_effect = table_router

    with pytest.raises(ProjectNotFoundError):
        create_sprint(mock_supabase, user_id="u-1", project_id="missing", payload=SprintCreate(name="X"))


def test_list_sprints_ordered_by_status_then_dates(mock_supabase):
    project_chain = MagicMock()
    project_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _project_row()
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"role": "member"}]
    sprints_chain = MagicMock()
    sprints_chain.select.return_value.eq.return_value.execute.return_value.data = [
        _sprint_row(id="s-active", status="active"),
        _sprint_row(id="s-planned1", status="planned", start_at="2026-06-01T00:00:00Z"),
        _sprint_row(id="s-completed", status="completed", end_at="2026-04-01T00:00:00Z"),
    ]

    def table_router(name):
        if name == "projects": return project_chain
        if name == "workspace_members": return members_chain
        if name == "sprints": return sprints_chain
        raise AssertionError(f"unexpected: {name}")
    mock_supabase.table.side_effect = table_router

    result = list_sprints(mock_supabase, user_id="u-1", project_id="p-1")
    # Active first, then planned, then completed
    assert [s.id for s in result] == ["s-active", "s-planned1", "s-completed"]


def test_get_sprint_member_ok(mock_supabase):
    sprints_chain = MagicMock()
    sprints_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _sprint_row()
    project_chain = MagicMock()
    project_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _project_row()
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"role": "member"}]

    def table_router(name):
        if name == "sprints": return sprints_chain
        if name == "projects": return project_chain
        if name == "workspace_members": return members_chain
        raise AssertionError(f"unexpected: {name}")
    mock_supabase.table.side_effect = table_router

    result = get_sprint(mock_supabase, user_id="u-1", sprint_id="s-1")
    assert result.id == "s-1"


def test_get_sprint_not_found(mock_supabase):
    sprints_chain = MagicMock()
    sprints_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = None

    def table_router(name):
        if name == "sprints": return sprints_chain
        raise AssertionError(f"unexpected: {name}")
    mock_supabase.table.side_effect = table_router

    with pytest.raises(SprintNotFoundError):
        get_sprint(mock_supabase, user_id="u-1", sprint_id="missing")


def test_update_sprint_happy_path(mock_supabase):
    sprints_chain_fetch = MagicMock()
    sprints_chain_fetch.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _sprint_row()
    project_chain = MagicMock()
    project_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _project_row()
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"role": "member"}]
    sprints_chain_update = MagicMock()
    sprints_chain_update.update.return_value.eq.return_value.execute.return_value.data = [_sprint_row(name="Renamed")]

    call_count = {"sprints": 0}
    def table_router(name):
        if name == "sprints":
            call_count["sprints"] += 1
            return sprints_chain_fetch if call_count["sprints"] == 1 else sprints_chain_update
        if name == "projects": return project_chain
        if name == "workspace_members": return members_chain
        raise AssertionError(f"unexpected: {name}")
    mock_supabase.table.side_effect = table_router

    result = update_sprint(
        mock_supabase, user_id="u-1", sprint_id="s-1",
        payload=SprintUpdate(name="Renamed"),
    )
    assert result.name == "Renamed"


def test_update_sprint_empty_payload(mock_supabase):
    sprints_chain = MagicMock()
    sprints_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _sprint_row()
    project_chain = MagicMock()
    project_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _project_row()
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"role": "member"}]

    def table_router(name):
        if name == "sprints": return sprints_chain
        if name == "projects": return project_chain
        if name == "workspace_members": return members_chain
        raise AssertionError(f"unexpected: {name}")
    mock_supabase.table.side_effect = table_router

    result = update_sprint(mock_supabase, user_id="u-1", sprint_id="s-1", payload=SprintUpdate())
    assert result.id == "s-1"


def test_delete_sprint_happy(mock_supabase):
    sprints_chain_fetch = MagicMock()
    sprints_chain_fetch.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _sprint_row()
    project_chain = MagicMock()
    project_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _project_row()
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"role": "member"}]
    sprints_chain_delete = MagicMock()
    sprints_chain_delete.delete.return_value.eq.return_value.execute.return_value.data = []

    call_count = {"sprints": 0}
    def table_router(name):
        if name == "sprints":
            call_count["sprints"] += 1
            return sprints_chain_fetch if call_count["sprints"] == 1 else sprints_chain_delete
        if name == "projects": return project_chain
        if name == "workspace_members": return members_chain
        raise AssertionError(f"unexpected: {name}")
    mock_supabase.table.side_effect = table_router

    result = delete_sprint(mock_supabase, user_id="u-1", sprint_id="s-1")
    assert result is None


def test_start_sprint_planned_to_active(mock_supabase):
    sprints_chain_fetch = MagicMock()
    sprints_chain_fetch.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _sprint_row(status="planned")
    project_chain = MagicMock()
    project_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _project_row()
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"role": "member"}]
    sprints_chain_update = MagicMock()
    sprints_chain_update.update.return_value.eq.return_value.execute.return_value.data = [_sprint_row(status="active")]

    call_count = {"sprints": 0}
    def table_router(name):
        if name == "sprints":
            call_count["sprints"] += 1
            return sprints_chain_fetch if call_count["sprints"] == 1 else sprints_chain_update
        if name == "projects": return project_chain
        if name == "workspace_members": return members_chain
        raise AssertionError(f"unexpected: {name}")
    mock_supabase.table.side_effect = table_router

    result = start_sprint(mock_supabase, user_id="u-1", sprint_id="s-1")
    assert result.status == "active"


def test_start_sprint_not_planned_raises(mock_supabase):
    sprints_chain = MagicMock()
    sprints_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _sprint_row(status="active")
    project_chain = MagicMock()
    project_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _project_row()
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"role": "member"}]

    def table_router(name):
        if name == "sprints": return sprints_chain
        if name == "projects": return project_chain
        if name == "workspace_members": return members_chain
        raise AssertionError(f"unexpected: {name}")
    mock_supabase.table.side_effect = table_router

    with pytest.raises(SprintInvalidTransitionError):
        start_sprint(mock_supabase, user_id="u-1", sprint_id="s-1")


def test_start_sprint_unique_violation_translates_to_AnotherActiveSprintError(mock_supabase):
    from postgrest.exceptions import APIError
    sprints_chain_fetch = MagicMock()
    sprints_chain_fetch.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _sprint_row(status="planned")
    project_chain = MagicMock()
    project_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _project_row()
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"role": "member"}]
    sprints_chain_update = MagicMock()
    sprints_chain_update.update.return_value.eq.return_value.execute.side_effect = APIError(
        {"code": "23505", "message": "duplicate key value violates unique constraint \"sprints_one_active_per_project\"", "details": None}
    )

    call_count = {"sprints": 0}
    def table_router(name):
        if name == "sprints":
            call_count["sprints"] += 1
            return sprints_chain_fetch if call_count["sprints"] == 1 else sprints_chain_update
        if name == "projects": return project_chain
        if name == "workspace_members": return members_chain
        raise AssertionError(f"unexpected: {name}")
    mock_supabase.table.side_effect = table_router

    with pytest.raises(AnotherActiveSprintError):
        start_sprint(mock_supabase, user_id="u-1", sprint_id="s-1")


def test_complete_sprint_calls_rpc(mock_supabase):
    sprints_chain = MagicMock()
    sprints_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _sprint_row(status="active")
    project_chain = MagicMock()
    project_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _project_row()
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"role": "member"}]

    def table_router(name):
        if name == "sprints": return sprints_chain
        if name == "projects": return project_chain
        if name == "workspace_members": return members_chain
        raise AssertionError(f"unexpected: {name}")
    mock_supabase.table.side_effect = table_router
    mock_supabase.rpc.return_value.execute.return_value.data = {
        "completed": "s-1", "rolled_over_to": "s-2", "count": 3
    }

    result = complete_sprint(mock_supabase, user_id="u-1", sprint_id="s-1")
    assert result == {"completed": "s-1", "rolled_over_to": "s-2", "count": 3}
    mock_supabase.rpc.assert_called_once_with("complete_sprint", {"p_sprint_id": "s-1"})


def test_complete_sprint_not_active_raises(mock_supabase):
    sprints_chain = MagicMock()
    sprints_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _sprint_row(status="planned")
    project_chain = MagicMock()
    project_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _project_row()
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"role": "member"}]

    def table_router(name):
        if name == "sprints": return sprints_chain
        if name == "projects": return project_chain
        if name == "workspace_members": return members_chain
        raise AssertionError(f"unexpected: {name}")
    mock_supabase.table.side_effect = table_router

    with pytest.raises(SprintInvalidTransitionError):
        complete_sprint(mock_supabase, user_id="u-1", sprint_id="s-1")
