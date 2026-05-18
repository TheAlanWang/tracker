"""Sprint business logic. Membership derived via project.workspace_id."""

from postgrest.exceptions import APIError
from supabase import AsyncClient

from app.schemas.sprint import SprintCreate, SprintResponse, SprintUpdate


class SprintError(Exception):
    pass


class SprintNotFoundError(SprintError):
    pass


class SprintPermissionError(SprintError):
    pass


class ProjectNotFoundError(SprintError):
    pass


class SprintInvalidTransitionError(SprintError):
    pass


class AnotherActiveSprintError(SprintError):
    pass


# Sort order: active first, then planned (by start_at asc), then completed (by end_at desc)
_STATUS_ORDER = {"active": 0, "planned": 1, "completed": 2}


async def _is_member(supabase: AsyncClient, *, user_id: str, workspace_id: str) -> bool:
    rows = (
        await supabase.table("workspace_members")
        .select("role")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .execute()
    ).data
    return bool(rows)


async def _fetch_project(supabase: AsyncClient, project_id: str) -> dict | None:
    return (
        await supabase.table("projects")
        .select("*")
        .eq("id", project_id)
        .single()
        .execute()
    ).data


async def _fetch_sprint(supabase: AsyncClient, sprint_id: str) -> dict | None:
    return (
        await supabase.table("sprints")
        .select("*")
        .eq("id", sprint_id)
        .single()
        .execute()
    ).data


async def _ensure_member_of_project(supabase: AsyncClient, user_id: str, project_id: str) -> dict:
    project = await _fetch_project(supabase, project_id)
    if not project:
        raise ProjectNotFoundError(project_id)
    if not await _is_member(supabase, user_id=user_id, workspace_id=project["workspace_id"]):
        raise SprintPermissionError(project_id)
    return project


async def _ensure_member_via_sprint(supabase: AsyncClient, user_id: str, sprint_id: str) -> dict:
    sprint = await _fetch_sprint(supabase, sprint_id)
    if not sprint:
        raise SprintNotFoundError(sprint_id)
    await _ensure_member_of_project(supabase, user_id, sprint["project_id"])
    return sprint


async def create_sprint(
    supabase: AsyncClient, *, user_id: str, project_id: str, payload: SprintCreate
) -> SprintResponse:
    await _ensure_member_of_project(supabase, user_id, project_id)
    data = payload.model_dump(mode="json", exclude_none=True)
    data["project_id"] = project_id
    row = (
        await supabase.table("sprints")
        .insert(data)
        .execute()
    ).data[0]
    return SprintResponse(**row)


async def list_sprints(
    supabase: AsyncClient, *, user_id: str, project_id: str
) -> list[SprintResponse]:
    await _ensure_member_of_project(supabase, user_id, project_id)
    rows = (
        await supabase.table("sprints")
        .select("*")
        .eq("project_id", project_id)
        .execute()
    ).data
    sprints = [SprintResponse(**r) for r in rows]
    # Sort: active first, then planned (by start_at asc, nulls last), then completed (by end_at desc)
    def sort_key(s: SprintResponse):
        primary = _STATUS_ORDER[s.status]
        if s.status == "completed":
            secondary = -(s.end_at.timestamp() if s.end_at else 0)
        else:
            secondary = s.start_at.timestamp() if s.start_at else float("inf")
        return (primary, secondary)
    sprints.sort(key=sort_key)
    return sprints


async def get_sprint(
    supabase: AsyncClient, *, user_id: str, sprint_id: str
) -> SprintResponse:
    sprint = await _ensure_member_via_sprint(supabase, user_id, sprint_id)
    return SprintResponse(**sprint)


async def update_sprint(
    supabase: AsyncClient, *, user_id: str, sprint_id: str, payload: SprintUpdate
) -> SprintResponse:
    sprint = await _ensure_member_via_sprint(supabase, user_id, sprint_id)
    updates = payload.model_dump(mode="json", exclude_unset=True)
    if not updates:
        return SprintResponse(**sprint)
    updated = (
        await supabase.table("sprints")
        .update(updates)
        .eq("id", sprint_id)
        .execute()
    ).data[0]
    return SprintResponse(**updated)


async def delete_sprint(
    supabase: AsyncClient, *, user_id: str, sprint_id: str
) -> None:
    await _ensure_member_via_sprint(supabase, user_id, sprint_id)
    await supabase.table("sprints").delete().eq("id", sprint_id).execute()
async def start_sprint(
    supabase: AsyncClient, *, user_id: str, sprint_id: str
) -> SprintResponse:
    sprint = await _ensure_member_via_sprint(supabase, user_id, sprint_id)
    if sprint["status"] != "planned":
        raise SprintInvalidTransitionError(sprint_id)
    try:
        updated = (
            await supabase.table("sprints")
            .update({"status": "active"})
            .eq("id", sprint_id)
            .execute()
        ).data[0]
    except APIError as exc:
        if exc.code == "23505":
            raise AnotherActiveSprintError(sprint["project_id"]) from exc
        raise
    return SprintResponse(**updated)


async def complete_sprint(
    supabase: AsyncClient, *, user_id: str, sprint_id: str
) -> dict:
    sprint = await _ensure_member_via_sprint(supabase, user_id, sprint_id)
    if sprint["status"] != "active":
        raise SprintInvalidTransitionError(sprint_id)
    result = await supabase.rpc("complete_sprint", {"p_sprint_id": sprint_id}).execute()
    return result.data
