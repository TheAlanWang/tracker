"""Sprint business logic. Membership derived via project.workspace_id."""

from postgrest.exceptions import APIError
from supabase import Client

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


def _is_member(supabase: Client, *, user_id: str, workspace_id: str) -> bool:
    rows = (
        supabase.table("workspace_members")
        .select("role")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .execute()
        .data
    )
    return bool(rows)


def _fetch_project(supabase: Client, project_id: str) -> dict | None:
    return (
        supabase.table("projects")
        .select("*")
        .eq("id", project_id)
        .single()
        .execute()
        .data
    )


def _fetch_sprint(supabase: Client, sprint_id: str) -> dict | None:
    return (
        supabase.table("sprints")
        .select("*")
        .eq("id", sprint_id)
        .single()
        .execute()
        .data
    )


def _ensure_member_of_project(supabase: Client, user_id: str, project_id: str) -> dict:
    project = _fetch_project(supabase, project_id)
    if not project:
        raise ProjectNotFoundError(project_id)
    if not _is_member(supabase, user_id=user_id, workspace_id=project["workspace_id"]):
        raise SprintPermissionError(project_id)
    return project


def _ensure_member_via_sprint(supabase: Client, user_id: str, sprint_id: str) -> dict:
    sprint = _fetch_sprint(supabase, sprint_id)
    if not sprint:
        raise SprintNotFoundError(sprint_id)
    _ensure_member_of_project(supabase, user_id, sprint["project_id"])
    return sprint


def create_sprint(
    supabase: Client, *, user_id: str, project_id: str, payload: SprintCreate
) -> SprintResponse:
    _ensure_member_of_project(supabase, user_id, project_id)
    data = payload.model_dump(mode="json", exclude_none=True)
    data["project_id"] = project_id
    row = (
        supabase.table("sprints")
        .insert(data)
        .execute()
        .data[0]
    )
    return SprintResponse(**row)


def list_sprints(
    supabase: Client, *, user_id: str, project_id: str
) -> list[SprintResponse]:
    _ensure_member_of_project(supabase, user_id, project_id)
    rows = (
        supabase.table("sprints")
        .select("*")
        .eq("project_id", project_id)
        .execute()
        .data
    )
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


def get_sprint(
    supabase: Client, *, user_id: str, sprint_id: str
) -> SprintResponse:
    sprint = _ensure_member_via_sprint(supabase, user_id, sprint_id)
    return SprintResponse(**sprint)


def update_sprint(
    supabase: Client, *, user_id: str, sprint_id: str, payload: SprintUpdate
) -> SprintResponse:
    sprint = _ensure_member_via_sprint(supabase, user_id, sprint_id)
    updates = payload.model_dump(mode="json", exclude_unset=True)
    if not updates:
        return SprintResponse(**sprint)
    updated = (
        supabase.table("sprints")
        .update(updates)
        .eq("id", sprint_id)
        .execute()
        .data[0]
    )
    return SprintResponse(**updated)


def delete_sprint(
    supabase: Client, *, user_id: str, sprint_id: str
) -> None:
    _ensure_member_via_sprint(supabase, user_id, sprint_id)
    supabase.table("sprints").delete().eq("id", sprint_id).execute()


def start_sprint(
    supabase: Client, *, user_id: str, sprint_id: str
) -> SprintResponse:
    sprint = _ensure_member_via_sprint(supabase, user_id, sprint_id)
    if sprint["status"] != "planned":
        raise SprintInvalidTransitionError(sprint_id)
    try:
        updated = (
            supabase.table("sprints")
            .update({"status": "active"})
            .eq("id", sprint_id)
            .execute()
            .data[0]
        )
    except APIError as exc:
        if exc.code == "23505":
            raise AnotherActiveSprintError(sprint["project_id"]) from exc
        raise
    return SprintResponse(**updated)


def complete_sprint(
    supabase: Client, *, user_id: str, sprint_id: str
) -> dict:
    sprint = _ensure_member_via_sprint(supabase, user_id, sprint_id)
    if sprint["status"] != "active":
        raise SprintInvalidTransitionError(sprint_id)
    result = supabase.rpc("complete_sprint", {"p_sprint_id": sprint_id}).execute()
    return result.data
