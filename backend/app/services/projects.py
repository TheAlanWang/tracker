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


def _derive_base_key(name: str) -> str:
    """First letter of each word; fall back to first 3 letters of single word."""
    words = [w for w in name.strip().split() if any(c.isalpha() for c in w)]
    if len(words) >= 2:
        return "".join(w[0].upper() for w in words[:4])
    single = "".join(c for c in (words[0] if words else "").upper() if c.isalpha())
    return single[:3]


def _resolve_unique_key(
    supabase: Client, *, workspace_id: str, base: str
) -> str:
    rows = (
        supabase.table("projects")
        .select("key")
        .eq("workspace_id", workspace_id)
        .execute()
        .data
    )
    existing = {r["key"] for r in rows}
    if base not in existing:
        return base
    n = 2
    while f"{base}{n}" in existing:
        n += 1
    return f"{base}{n}"


def create_project(
    supabase: Client, *, user_id: str, workspace_id: str, payload: ProjectCreate
) -> ProjectResponse:
    if not _is_member(supabase, user_id=user_id, workspace_id=workspace_id):
        raise ProjectPermissionError(workspace_id)

    # If no key supplied, derive from name and auto-bump suffix on collision
    # so users never have to think about backend identifiers.
    if payload.key:
        key = payload.key
    else:
        base = _derive_base_key(payload.name)
        if len(base) < 2:
            raise ProjectKeyExistsError("__derive_failed__")
        key = _resolve_unique_key(supabase, workspace_id=workspace_id, base=base)

    try:
        result = (
            supabase.table("projects")
            .insert(
                {
                    "workspace_id": workspace_id,
                    "name": payload.name,
                    "key": key,
                    "description": payload.description,
                }
            )
            .execute()
        )
    except APIError as exc:
        if exc.code == "23505":
            # Race: another project grabbed this key between our check and insert.
            # If we derived it, retry once with a fresh resolve. Otherwise surface.
            if not payload.key:
                base = _derive_base_key(payload.name)
                key = _resolve_unique_key(
                    supabase, workspace_id=workspace_id, base=base
                )
                result = (
                    supabase.table("projects")
                    .insert(
                        {
                            "workspace_id": workspace_id,
                            "name": payload.name,
                            "key": key,
                            "description": payload.description,
                        }
                    )
                    .execute()
                )
            else:
                raise ProjectKeyExistsError(payload.key) from exc
        else:
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
