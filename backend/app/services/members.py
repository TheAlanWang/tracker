"""Workspace member management: list / change role / remove.

Inviting a new user is NOT here — see app/services/invitations.py. The
historical invite_member function (direct workspace_members insert with no
acceptance step) was retired when the proper invitation flow landed.

Permissions enforced at the service layer (workspace_members.role check):
- list_members: any current member can list.
- update_member_role: owner or admin.
- remove_member: owner only (intentionally tighter than role updates).
"""

import logging

from supabase import AsyncClient

from app.schemas.member import MemberResponse
from app.services._user_profiles import user_profile_from_auth

logger = logging.getLogger(__name__)


class MemberError(Exception):
    pass


class NotAMemberError(MemberError):
    pass


class MemberPermissionError(MemberError):
    pass


class UserNotFoundError(MemberError):
    pass


class AlreadyMemberError(MemberError):
    pass


class CannotModifyOwnerError(MemberError):
    pass


class CannotTransferError(MemberError):
    pass


async def _get_caller_role(supabase: AsyncClient, *, user_id: str, workspace_id: str) -> str | None:
    """Return the caller's role in the workspace, or None if not a member."""
    rows = (
        await supabase.table("workspace_members")
        .select("role")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .execute()
    ).data
    return rows[0]["role"] if rows else None


async def _lookup_user_emails(supabase: AsyncClient, user_ids: list[str]) -> dict[str, str]:
    """Return user_id -> email (legacy helper kept for invite flow)."""
    if not user_ids:
        return {}
    try:
        users = await supabase.auth.admin.list_users()
        return {u.id: (u.email or "") for u in users if u.id in user_ids}
    except Exception:
        return {}


async def _lookup_user_profiles(
    supabase: AsyncClient, user_ids: list[str]
) -> dict[str, dict[str, str | None]]:
    """Return user_id -> {email, display_name, avatar_url, avatar_color}."""
    if not user_ids:
        return {}
    result: dict[str, dict[str, str | None]] = {}
    try:
        users = await supabase.auth.admin.list_users()
        for u in users:
            if u.id in user_ids:
                result[u.id] = user_profile_from_auth(u)
    except Exception:
        pass
    return result


async def list_members(
    supabase: AsyncClient, *, user_id: str, workspace_id: str
) -> list[MemberResponse]:
    # Caller must be a member to list
    own_rows = (
        await supabase.table("workspace_members")
        .select("role")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .execute()
    ).data
    if not own_rows:
        raise NotAMemberError(workspace_id)

    rows = (
        await supabase.table("workspace_members")
        .select("*")
        .eq("workspace_id", workspace_id)
        .execute()
    ).data

    # Look up profile fields (email / display_name / avatar_url / avatar_color)
    all_user_ids = [r["user_id"] for r in rows]
    profile_map = await _lookup_user_profiles(supabase, all_user_ids)

    return [
        MemberResponse(
            **r,
            email=profile_map.get(r["user_id"], {}).get("email"),
            display_name=profile_map.get(r["user_id"], {}).get("display_name"),
            avatar_url=profile_map.get(r["user_id"], {}).get("avatar_url"),
            avatar_color=profile_map.get(r["user_id"], {}).get("avatar_color"),
        )
        for r in rows
    ]


async def update_member_role(
    supabase: AsyncClient,
    *,
    user_id: str,
    workspace_id: str,
    target_user_id: str,
    role: str,
) -> MemberResponse:
    """Update the role of a workspace member. Caller must be owner or admin."""
    caller_role = await _get_caller_role(supabase, user_id=user_id, workspace_id=workspace_id)
    if caller_role not in ("owner", "admin"):
        raise MemberPermissionError("Only owner or admin can update roles")

    # Get the target member's current role
    target_rows = (
        await supabase.table("workspace_members")
        .select("role")
        .eq("workspace_id", workspace_id)
        .eq("user_id", target_user_id)
        .execute()
    ).data
    if not target_rows:
        raise NotAMemberError(target_user_id)

    if target_rows[0]["role"] == "owner":
        raise CannotModifyOwnerError("Cannot change the role of the workspace owner")

    row = (
        await supabase.table("workspace_members")
        .update({"role": role})
        .eq("workspace_id", workspace_id)
        .eq("user_id", target_user_id)
        .execute()
    ).data[0]
    email_map = await _lookup_user_emails(supabase, [target_user_id])
    return MemberResponse(**row, email=email_map.get(target_user_id))


async def transfer_ownership(
    supabase: AsyncClient,
    *,
    user_id: str,
    workspace_id: str,
    target_user_id: str,
) -> None:
    """Transfer workspace ownership to another member. Caller must be the
    CURRENT owner (checked against workspaces.owner_id, the source of truth,
    not the role string). The target must be an existing member; they become
    owner and the caller is demoted to admin. The actual 3-row swap is done
    atomically by the transfer_workspace_ownership RPC."""
    ws = (
        await supabase.table("workspaces")
        .select("owner_id")
        .eq("id", workspace_id)
        .single()
        .execute()
    ).data
    if not ws:
        raise NotAMemberError(workspace_id)
    if ws["owner_id"] != user_id:
        raise MemberPermissionError(
            "Only the workspace owner can transfer ownership"
        )
    if target_user_id == user_id:
        raise CannotTransferError("You are already the owner")
    if not await _get_caller_role(
        supabase, user_id=target_user_id, workspace_id=workspace_id
    ):
        raise NotAMemberError(target_user_id)

    await supabase.rpc(
        "transfer_workspace_ownership",
        {"p_workspace_id": workspace_id, "p_new_owner": target_user_id},
    ).execute()

    # Notify the new owner. Workspace-scoped notification (no task_id);
    # payload carries the workspace name like invitation_accepted does.
    # Best-effort — a notification failure must not fail the transfer.
    try:
        ws_row = (
            await supabase.table("workspaces")
            .select("name")
            .eq("id", workspace_id)
            .single()
            .execute()
        ).data
        await supabase.table("notifications").insert(
            {
                "user_id": target_user_id,
                "type": "ownership_transferred",
                "actor_id": user_id,
                "task_id": None,
                "payload": {
                    "workspace_id": workspace_id,
                    "workspace_name": (ws_row or {}).get("name"),
                },
            }
        ).execute()
    except Exception:
        logger.exception(
            "Failed to insert ownership_transferred notification "
            "(workspace=%s, new_owner=%s)",
            workspace_id,
            target_user_id,
        )


async def remove_member(
    supabase: AsyncClient, *, user_id: str, workspace_id: str, target_user_id: str
) -> None:
    """Remove a member from the workspace. Only the workspace owner can do this."""
    caller_role = await _get_caller_role(supabase, user_id=user_id, workspace_id=workspace_id)
    if caller_role != "owner":
        raise MemberPermissionError("Only the workspace owner can remove members")

    # Get target's current role
    target_rows = (
        await supabase.table("workspace_members")
        .select("role")
        .eq("workspace_id", workspace_id)
        .eq("user_id", target_user_id)
        .execute()
    ).data
    if not target_rows:
        raise NotAMemberError(target_user_id)

    if target_rows[0]["role"] == "owner":
        raise CannotModifyOwnerError("Cannot remove the workspace owner")

    await supabase.table("workspace_members").delete().eq(
        "workspace_id", workspace_id
    ).eq("user_id", target_user_id).execute()
