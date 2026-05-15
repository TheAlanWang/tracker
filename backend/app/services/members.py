from supabase import Client

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


def _get_caller_role(supabase: Client, *, user_id: str, workspace_id: str) -> str | None:
    """Return the caller's role in the workspace, or None if not a member."""
    rows = (
        supabase.table("workspace_members")
        .select("role")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .execute()
        .data
    )
    return rows[0]["role"] if rows else None


def _lookup_user_emails(supabase: Client, user_ids: list[str]) -> dict[str, str]:
    """Return a dict mapping user_id -> email for the given ids.

    Uses supabase.auth.admin.list_users() which returns a list of GoTrueUser
    objects (supabase-py v2). Each object has .id and .email attributes.
    """
    if not user_ids:
        return {}
    try:
        users = supabase.auth.admin.list_users()
        # supabase-py v2: list_users() returns a list of UserModel objects directly
        return {u.id: (u.email or "") for u in users if u.id in user_ids}
    except Exception:
        # Fall back gracefully if admin API is unavailable (e.g. in tests)
        return {}


def list_members(
    supabase: Client, *, user_id: str, workspace_id: str
) -> list[MemberResponse]:
    # Caller must be a member to list
    own_rows = (
        supabase.table("workspace_members")
        .select("role")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .execute()
        .data
    )
    if not own_rows:
        raise NotAMemberError(workspace_id)

    rows = (
        supabase.table("workspace_members")
        .select("*")
        .eq("workspace_id", workspace_id)
        .execute()
        .data
    )

    # Look up emails for all members
    all_user_ids = [r["user_id"] for r in rows]
    email_map = _lookup_user_emails(supabase, all_user_ids)

    return [
        MemberResponse(**r, email=email_map.get(r["user_id"]))
        for r in rows
    ]


def invite_member(
    supabase: Client, *, user_id: str, workspace_id: str, email: str
) -> MemberResponse:
    """Invite a user by email to the workspace. Caller must be owner or admin."""
    caller_role = _get_caller_role(supabase, user_id=user_id, workspace_id=workspace_id)
    if caller_role not in ("owner", "admin"):
        raise MemberPermissionError("Only owner or admin can invite members")

    # Look up user by email via admin API
    try:
        users = supabase.auth.admin.list_users()
        target = next((u for u in users if u.email == email), None)
    except Exception as exc:
        raise UserNotFoundError(email) from exc

    if target is None:
        raise UserNotFoundError(email)

    target_user_id = target.id

    # Check if already a member
    existing = (
        supabase.table("workspace_members")
        .select("role")
        .eq("workspace_id", workspace_id)
        .eq("user_id", target_user_id)
        .execute()
        .data
    )
    if existing:
        raise AlreadyMemberError(target_user_id)

    row = (
        supabase.table("workspace_members")
        .insert(
            {"workspace_id": workspace_id, "user_id": target_user_id, "role": "member"}
        )
        .execute()
        .data[0]
    )
    return MemberResponse(**row, email=email)


def update_member_role(
    supabase: Client,
    *,
    user_id: str,
    workspace_id: str,
    target_user_id: str,
    role: str,
) -> MemberResponse:
    """Update the role of a workspace member. Caller must be owner or admin."""
    caller_role = _get_caller_role(supabase, user_id=user_id, workspace_id=workspace_id)
    if caller_role not in ("owner", "admin"):
        raise MemberPermissionError("Only owner or admin can update roles")

    # Get the target member's current role
    target_rows = (
        supabase.table("workspace_members")
        .select("role")
        .eq("workspace_id", workspace_id)
        .eq("user_id", target_user_id)
        .execute()
        .data
    )
    if not target_rows:
        raise NotAMemberError(target_user_id)

    if target_rows[0]["role"] == "owner":
        raise CannotModifyOwnerError("Cannot change the role of the workspace owner")

    row = (
        supabase.table("workspace_members")
        .update({"role": role})
        .eq("workspace_id", workspace_id)
        .eq("user_id", target_user_id)
        .execute()
        .data[0]
    )
    email_map = _lookup_user_emails(supabase, [target_user_id])
    return MemberResponse(**row, email=email_map.get(target_user_id))


def remove_member(
    supabase: Client, *, user_id: str, workspace_id: str, target_user_id: str
) -> None:
    """Remove a member from the workspace. Caller must be owner or admin."""
    caller_role = _get_caller_role(supabase, user_id=user_id, workspace_id=workspace_id)
    if caller_role not in ("owner", "admin"):
        raise MemberPermissionError("Only owner or admin can remove members")

    # Get target's current role
    target_rows = (
        supabase.table("workspace_members")
        .select("role")
        .eq("workspace_id", workspace_id)
        .eq("user_id", target_user_id)
        .execute()
        .data
    )
    if not target_rows:
        raise NotAMemberError(target_user_id)

    if target_rows[0]["role"] == "owner":
        raise CannotModifyOwnerError("Cannot remove the workspace owner")

    supabase.table("workspace_members").delete().eq(
        "workspace_id", workspace_id
    ).eq("user_id", target_user_id).execute()
