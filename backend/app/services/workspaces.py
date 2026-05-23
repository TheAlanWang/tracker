"""Workspace business logic.

Service functions take an admin Supabase client and the acting user_id, then
perform explicit ownership / membership checks. The service layer is the
authoritative gate; RLS policies are defense-in-depth.
"""

from postgrest.exceptions import APIError
from supabase import AsyncClient

from app.schemas.workspace import (
    WorkspaceCreate,
    WorkspaceResponse,
    WorkspaceUpdate,
)


class WorkspaceError(Exception):
    """Base class for workspace domain errors."""


class WorkspaceNotFoundError(WorkspaceError):
    pass


class WorkspacePermissionError(WorkspaceError):
    pass


class WorkspaceSlugExistsError(WorkspaceError):
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


async def create_workspace(
    supabase: AsyncClient, *, user_id: str, payload: WorkspaceCreate
) -> WorkspaceResponse:
    try:
        result = await (
            supabase.table("workspaces")
            .insert(
                {"name": payload.name, "slug": payload.slug, "owner_id": user_id}
            )
            .execute()
        )
    except APIError as exc:
        if exc.code == "23505":
            raise WorkspaceSlugExistsError(payload.slug) from exc
        raise

    workspace = result.data[0]

    # Auto-insert the owner as a member with role=owner
    await supabase.table("workspace_members").insert(
        {"workspace_id": workspace["id"], "user_id": user_id, "role": "owner"}
    ).execute()

    return WorkspaceResponse(**workspace)


async def get_workspace(
    supabase: AsyncClient, *, user_id: str, workspace_id: str
) -> WorkspaceResponse:
    if not await _is_member(supabase, user_id=user_id, workspace_id=workspace_id):
        raise WorkspacePermissionError(workspace_id)

    row = (
        await supabase.table("workspaces")
        .select("*")
        .eq("id", workspace_id)
        .single()
        .execute()
    ).data
    if not row:
        raise WorkspaceNotFoundError(workspace_id)

    return WorkspaceResponse(**row)


async def list_workspaces_for_user(
    supabase: AsyncClient, *, user_id: str
) -> list[WorkspaceResponse]:
    member_rows = (
        await supabase.table("workspace_members")
        .select("workspace_id")
        .eq("user_id", user_id)
        .execute()
    ).data
    if not member_rows:
        return []

    ws_ids = [r["workspace_id"] for r in member_rows]
    rows = (
        await supabase.table("workspaces")
        .select("*")
        .in_("id", ws_ids)
        .execute()
    ).data
    return [WorkspaceResponse(**r) for r in rows]


async def update_workspace(
    supabase: AsyncClient,
    *,
    user_id: str,
    workspace_id: str,
    payload: WorkspaceUpdate,
) -> WorkspaceResponse:
    row = (
        await supabase.table("workspaces")
        .select("*")
        .eq("id", workspace_id)
        .single()
        .execute()
    ).data
    if not row:
        raise WorkspaceNotFoundError(workspace_id)
    if row["owner_id"] != user_id:
        raise WorkspacePermissionError(workspace_id)

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return WorkspaceResponse(**row)

    # features is a partial merge — preserve keys the client didn't send.
    # Without this a single-key flip would wipe every other flag.
    if "features" in updates and updates["features"] is not None:
        existing = row.get("features") or {}
        updates["features"] = {**existing, **updates["features"]}

    try:
        updated = (
            await supabase.table("workspaces")
            .update(updates)
            .eq("id", workspace_id)
            .execute()
        ).data[0]
    except APIError as exc:
        # Unique constraint on slug — translate to a typed error so the
        # router can return 409 with a useful message. Same pattern as
        # create_workspace.
        if exc.code == "23505":
            raise WorkspaceSlugExistsError(updates.get("slug", "")) from exc
        raise
    return WorkspaceResponse(**updated)


async def delete_workspace(
    supabase: AsyncClient, *, user_id: str, workspace_id: str
) -> None:
    row = (
        await supabase.table("workspaces")
        .select("owner_id")
        .eq("id", workspace_id)
        .single()
        .execute()
    ).data
    if not row:
        raise WorkspaceNotFoundError(workspace_id)
    if row["owner_id"] != user_id:
        raise WorkspacePermissionError(workspace_id)

    await supabase.table("workspaces").delete().eq("id", workspace_id).execute()