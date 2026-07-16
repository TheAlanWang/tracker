from unittest.mock import MagicMock

import pytest
from postgrest.exceptions import APIError
from pydantic import ValidationError

from app.schemas.project import ProjectCreate, ProjectUpdate
from app.services.projects import (
    ProjectKeyExistsError,
    ProjectNotFoundError,
    ProjectPermissionError,
    create_project,
    get_project,
    list_projects,
)


def _proj_row(**over):
    base = {
        "id": "p-1", "workspace_id": "ws-1", "name": "Backend",
        "key": "BE", "next_task_number": 1, "description": None,
        "created_at": "2026-05-14T00:00:00Z", "updated_at": "2026-05-14T00:00:00Z",
    }
    base.update(over)
    return base


@pytest.fixture
def mock_supabase():
    return MagicMock()


async def test_create_project_returns_response(mock_supabase):
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"role": "member"}]
    mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [_proj_row()]
    result = await create_project(
        mock_supabase, user_id="u1", workspace_id="ws-1",
        payload=ProjectCreate(name="Backend", key="BE"),
    )
    assert result.key == "BE"


async def test_create_project_non_member_raises(mock_supabase):
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
    with pytest.raises(ProjectPermissionError):
        await create_project(
            mock_supabase, user_id="u1", workspace_id="ws-1",
            payload=ProjectCreate(name="X", key="XX"),
        )


async def test_create_project_duplicate_key_raises(mock_supabase):
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"role": "member"}]
    mock_supabase.table.return_value.insert.return_value.execute.side_effect = APIError(
        {"code": "23505", "message": "duplicate", "details": "(workspace_id, key) already exists"}
    )
    with pytest.raises(ProjectKeyExistsError):
        await create_project(
            mock_supabase, user_id="u1", workspace_id="ws-1",
            payload=ProjectCreate(name="X", key="BE"),
        )


async def test_get_project_not_found_raises(mock_supabase):
    proj_chain = MagicMock()
    proj_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = None

    def table_router(name):
        if name == "projects":
            return proj_chain
        raise AssertionError(f"unexpected table: {name}")

    mock_supabase.table.side_effect = table_router

    with pytest.raises(ProjectNotFoundError):
        await get_project(mock_supabase, user_id="u1", project_id="missing")


def test_project_update_accepts_auto_archive_days():
    assert ProjectUpdate(auto_archive_days="off").auto_archive_days == "off"
    assert ProjectUpdate(auto_archive_days="14").auto_archive_days == "14"


def test_project_update_rejects_unknown_auto_archive_days():
    with pytest.raises(ValidationError):
        ProjectUpdate(auto_archive_days="45")
