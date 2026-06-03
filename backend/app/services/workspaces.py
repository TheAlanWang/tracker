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


async def get_workspace_storage_bytes(
    supabase: AsyncClient, *, user_id: str, workspace_id: str
) -> int:
    """Total bytes of task-image uploads owned by this workspace, for the
    Plan section's storage usage display. Caller must be a member."""
    if not await _is_member(supabase, user_id=user_id, workspace_id=workspace_id):
        raise WorkspacePermissionError(workspace_id)
    result = await supabase.rpc(
        "workspace_storage_bytes", {"p_workspace_id": workspace_id}
    ).execute()
    # RPC returns a bare bigint; supabase-py surfaces it as .data
    return int(result.data or 0)


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
    # Single embedded join, NOT "fetch member rows -> look up workspaces by id".
    # The old two-step form built a `workspaces?id=in.(<every id>)` request whose
    # URL grew with membership count; past a few thousand workspaces it blew the
    # request-length limit, PostgREST 400'd, and the uncaught error took /me — and
    # thus every page — down. Embedding pushes the join into Postgres, so the URL
    # stays a fixed small size no matter how many workspaces the user belongs to.
    # `!inner` keeps only workspaces with a matching member row; the nested
    # workspace_members key it adds to each row is an extra field WorkspaceResponse
    # ignores.
    rows = (
        await supabase.table("workspaces")
        .select("*, workspace_members!inner(user_id)")
        .eq("workspace_members.user_id", user_id)
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