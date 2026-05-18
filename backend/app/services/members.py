"""Workspace member management: list / change role / remove.

Inviting a new user is NOT here — see app/services/invitations.py. The
historical invite_member function (direct workspace_members insert with no
acceptance step) was retired when the proper invitation flow landed.

Permissions enforced at the service layer (workspace_members.role check):
- list_members: any current member can list.
- update_member_role: owner or admin.
- remove_member: owner only (intentionally tighter than role updates).
"""

from supabase import AsyncClient

from app.schemas.member import MemberResponse


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
    """Return user_id -> {email, display_name} for the given ids."""
    if not user_ids:
        return {}
    result: dict[str, dict[str, str | None]] = {}
    try:
        users = await supabase.auth.admin.list_users()
        for u in users:
            if u.id in user_ids:
                meta = u.user_metadata or {}
                result[u.id] = {
                    "email": u.email,
                    "display_name": meta.get("display_name"),
                }
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

    # Look up email + display_name for all members
    all_user_ids = [r["user_id"] for r in rows]
    profile_map = await _lookup_user_profiles(supabase, all_user_ids)

    return [
        MemberResponse(
            **r,
            email=profile_map.get(r["user_id"], {}).get("email"),
            display_name=profile_map.get(r["user_id"], {}).get("display_name"),
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
