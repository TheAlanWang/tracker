"""Workspace business logic.

Service functions take an admin Supabase client and the acting user_id, then
perform explicit ownership / membership checks. The service layer is the
authoritative gate; RLS policies are defense-in-depth.
"""

from postgrest.exceptions import APIError
from supabase import Client

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


def create_workspace(
    supabase: Client, *, user_id: str, payload: WorkspaceCreate
) -> WorkspaceResponse:
    try:
        result = (
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
    supabase.table("workspace_members").insert(
        {"workspace_id": workspace["id"], "user_id": user_id, "role": "owner"}
    ).execute()

    return WorkspaceResponse(**workspace)


def get_workspace(
    supabase: Client, *, user_id: str, workspace_id: str
) -> WorkspaceResponse:
    if not _is_member(supabase, user_id=user_id, workspace_id=workspace_id):
        raise WorkspacePermissionError(workspace_id)

    row = (
        supabase.table("workspaces")
        .select("*")
        .eq("id", workspace_id)
        .single()
        .execute()
        .data
    )
    if not row:
        raise WorkspaceNotFoundError(workspace_id)

    return WorkspaceResponse(**row)


def list_workspaces_for_user(
    supabase: Client, *, user_id: str
) -> list[WorkspaceResponse]:
    member_rows = (
        supabase.table("workspace_members")
        .select("workspace_id")
        .eq("user_id", user_id)
        .execute()
        .data
    )
    if not member_rows:
        return []

    ws_ids = [r["workspace_id"] for r in member_rows]
    rows = (
        supabase.table("workspaces")
        .select("*")
        .in_("id", ws_ids)
        .execute()
        .data
    )
    return [WorkspaceResponse(**r) for r in rows]


def update_workspace(
    supabase: Client,
    *,
    user_id: str,
    workspace_id: str,
    payload: WorkspaceUpdate,
) -> WorkspaceResponse:
    row = (
        supabase.table("workspaces")
        .select("*")
        .eq("id", workspace_id)
        .single()
        .execute()
        .data
    )
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

    updated = (
        supabase.table("workspaces")
        .update(updates)
        .eq("id", workspace_id)
        .execute()
        .data[0]
    )
    return WorkspaceResponse(**updated)


def delete_workspace(
    supabase: Client, *, user_id: str, workspace_id: str
) -> None:
    row = (
        supabase.table("workspaces")
        .select("owner_id")
        .eq("id", workspace_id)
        .single()
        .execute()
        .data
    )
    if not row:
        raise WorkspaceNotFoundError(workspace_id)
    if row["owner_id"] != user_id:
        raise WorkspacePermissionError(workspace_id)

    supabase.table("workspaces").delete().eq("id", workspace_id).execute()
