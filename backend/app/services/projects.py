from postgrest.exceptions import APIError
from supabase import Client

from app.schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate


class ProjectError(Exception):
    pass


class ProjectNotFoundError(ProjectError):
    pass


class ProjectPermissionError(ProjectError):
    pass


class ProjectKeyExistsError(ProjectError):
    pass


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


def create_project(
    supabase: Client, *, user_id: str, workspace_id: str, payload: ProjectCreate
) -> ProjectResponse:
    if not _is_member(supabase, user_id=user_id, workspace_id=workspace_id):
        raise ProjectPermissionError(workspace_id)

    try:
        result = (
            supabase.table("projects")
            .insert(
                {
                    "workspace_id": workspace_id,
                    "name": payload.name,
                    "key": payload.key,
                    "description": payload.description,
                }
            )
            .execute()
        )
    except APIError as exc:
        if exc.code == "23505":
            raise ProjectKeyExistsError(payload.key) from exc
        raise

    return ProjectResponse(**result.data[0])


def list_projects(
    supabase: Client, *, user_id: str, workspace_id: str
) -> list[ProjectResponse]:
    if not _is_member(supabase, user_id=user_id, workspace_id=workspace_id):
        raise ProjectPermissionError(workspace_id)

    rows = (
        supabase.table("projects")
        .select("*")
        .eq("workspace_id", workspace_id)
        .order("created_at")
        .execute()
        .data
    )
    return [ProjectResponse(**r) for r in rows]


def get_project(
    supabase: Client, *, user_id: str, project_id: str
) -> ProjectResponse:
    row = (
        supabase.table("projects")
        .select("*")
        .eq("id", project_id)
        .single()
        .execute()
        .data
    )
    if not row:
        raise ProjectNotFoundError(project_id)
    if not _is_member(supabase, user_id=user_id, workspace_id=row["workspace_id"]):
        raise ProjectPermissionError(project_id)
    return ProjectResponse(**row)


def update_project(
    supabase: Client, *, user_id: str, project_id: str, payload: ProjectUpdate
) -> ProjectResponse:
    # Fetch first to discover workspace_id and check membership
    current = get_project(supabase, user_id=user_id, project_id=project_id)

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return current

    updated = (
        supabase.table("projects")
        .update(updates)
        .eq("id", project_id)
        .execute()
        .data[0]
    )
    return ProjectResponse(**updated)


def delete_project(
    supabase: Client, *, user_id: str, project_id: str
) -> None:
    # Verify membership via get_project's checks
    get_project(supabase, user_id=user_id, project_id=project_id)
    supabase.table("projects").delete().eq("id", project_id).execute()
