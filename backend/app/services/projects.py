from postgrest.exceptions import APIError
from supabase import AsyncClient

from app.schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate


class ProjectError(Exception):
    pass


class ProjectNotFoundError(ProjectError):
    pass


class ProjectPermissionError(ProjectError):
    pass


class ProjectKeyExistsError(ProjectError):
    pass


async def _is_member(supabase: AsyncClient, *, user_id: str, workspace_id: str) -> bool:
    rows = (
        await supabase.table("workspace_members")
        .select("role")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .execute()
    ).data
    return bool(rows)


def _derive_base_key(name: str) -> str:
    """First letter of each word; fall back to first 3 letters of single word."""
    words = [w for w in name.strip().split() if any(c.isalpha() for c in w)]
    if len(words) >= 2:
        return "".join(w[0].upper() for w in words[:4])
    single = "".join(c for c in (words[0] if words else "").upper() if c.isalpha())
    return single[:3]


async def _resolve_unique_key(
    supabase: AsyncClient, *, workspace_id: str, base: str
) -> str:
    rows = (
        await supabase.table("projects")
        .select("key")
        .eq("workspace_id", workspace_id)
        .execute()
    ).data
    existing = {r["key"] for r in rows}
    if base not in existing:
        return base
    n = 2
    while f"{base}{n}" in existing:
        n += 1
    return f"{base}{n}"


async def create_project(
    supabase: AsyncClient, *, user_id: str, workspace_id: str, payload: ProjectCreate
) -> ProjectResponse:
    if not await _is_member(supabase, user_id=user_id, workspace_id=workspace_id):
        raise ProjectPermissionError(workspace_id)

    # If no key supplied, derive from name and auto-bump suffix on collision
    # so users never have to think about backend identifiers.
    if payload.key:
        key = payload.key
    else:
        base = _derive_base_key(payload.name)
        if len(base) < 2:
            raise ProjectKeyExistsError("__derive_failed__")
        key = await _resolve_unique_key(supabase, workspace_id=workspace_id, base=base)

    try:
        result = await (
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
                key = await _resolve_unique_key(
                    supabase, workspace_id=workspace_id, base=base
                )
                result = await (
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


async def list_projects(
    supabase: AsyncClient, *, user_id: str, workspace_id: str
) -> list[ProjectResponse]:
    if not await _is_member(supabase, user_id=user_id, workspace_id=workspace_id):
        raise ProjectPermissionError(workspace_id)

    rows = (
        await supabase.table("projects")
        .select("*")
        .eq("workspace_id", workspace_id)
        .order("created_at")
        .execute()
    ).data
    return [ProjectResponse(**r) for r in rows]


async def get_project(
    supabase: AsyncClient, *, user_id: str, project_id: str
) -> ProjectResponse:
    row = (
        await supabase.table("projects")
        .select("*")
        .eq("id", project_id)
        .single()
        .execute()
    ).data
    if not row:
        raise ProjectNotFoundError(project_id)
    if not await _is_member(supabase, user_id=user_id, workspace_id=row["workspace_id"]):
        raise ProjectPermissionError(project_id)
    return ProjectResponse(**row)


async def update_project(
    supabase: AsyncClient, *, user_id: str, project_id: str, payload: ProjectUpdate
) -> ProjectResponse:
    # Fetch first to discover workspace_id and check membership
    current = await get_project(supabase, user_id=user_id, project_id=project_id)

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return current

    # Empty-string color from the frontend means "clear back to default";
    # store as NULL so the frontend falls back to the hash-derived hue.
    if "color" in updates and updates["color"] == "":
        updates["color"] = None

    # Key changes are special: they need to atomically rewrite every task
    # identifier in the project. Defer that to the rename_project_key RPC
    # so the rename + project.key update happen in one DB transaction.
    new_key = updates.pop("key", None)
    if new_key is not None and new_key != current.key:
        # Reject collision early — same (workspace_id, key) unique constraint
        # that protects creates. We surface as ProjectKeyExistsError so the
        # router can return 409 with a helpful message.
        existing = (
            await supabase.table("projects")
            .select("id")
            .eq("workspace_id", current.workspace_id)
            .eq("key", new_key)
            .neq("id", project_id)
            .execute()
        ).data
        if existing:
            raise ProjectKeyExistsError(new_key)
        try:
            await supabase.rpc(
                "rename_project_key",
                {"p_project_id": project_id, "p_new_key": new_key},
            ).execute()
        except APIError as exc:
            # Race: another project grabbed this key between our check and
            # the RPC. Translate to ProjectKeyExistsError uniformly.
            if exc.code == "23505":
                raise ProjectKeyExistsError(new_key) from exc
            raise

    if updates:
        await supabase.table("projects").update(updates).eq("id", project_id).execute()
    # Always re-fetch — the RPC bypassed PostgREST so we don't have its
    # post-update row, and the partial update only returned its own row.
    refreshed = (
        await supabase.table("projects")
        .select("*")
        .eq("id", project_id)
        .single()
        .execute()
    ).data
    return ProjectResponse(**refreshed)


async def delete_project(
    supabase: AsyncClient, *, user_id: str, project_id: str
) -> None:
    # Verify membership via get_project's checks
    await get_project(supabase, user_id=user_id, project_id=project_id)
    await supabase.table("projects").delete().eq("id", project_id).execute()