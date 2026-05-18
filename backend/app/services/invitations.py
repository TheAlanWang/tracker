"""Workspace invitation lifecycle: pending → accepted / declined / revoked.

Two-sided service:
- Admin operations (caller must be owner/admin of the workspace):
  create_invitation, list_workspace_invitations, revoke_invitation.
- Invitee operations (caller is the email-matched recipient):
  list_my_invitations, accept_invitation, decline_invitation.

Email handling: when invited email does NOT correspond to an existing
auth.users row, we kick off a Supabase invite email via
auth.admin.invite_user_by_email so the recipient can sign up and land in
the in-app accept flow. Existing users see the invite via the inbox bell +
Home panel on next sign-in (no email — would require custom SMTP).

Accept/decline write a row into `notifications` (type=invitation_accepted /
invitation_declined) so the inviter learns the outcome from their bell.
"""

import logging
import os
from datetime import datetime, timezone

from supabase import AsyncClient

from app.schemas.invitation import InvitationResponse

logger = logging.getLogger(__name__)

# Where the email's confirmation link should send recipients. Vite dev server
# defaults to 5173; override in production by exporting FRONTEND_URL.
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://127.0.0.1:5173")


class InvitationError(Exception):
    pass


class InvitationPermissionError(InvitationError):
    pass


class InvitationNotFoundError(InvitationError):
    pass


class InvitationAlreadyExistsError(InvitationError):
    pass


class AlreadyMemberError(InvitationError):
    pass


class InvitationNotPendingError(InvitationError):
    pass


class UserEmailMismatchError(InvitationError):
    pass


async def _get_caller_role(
    supabase: AsyncClient, *, user_id: str, workspace_id: str
) -> str | None:
    rows = (
        await supabase.table("workspace_members")
        .select("role")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .execute()
    ).data
    return rows[0]["role"] if rows else None


async def _lookup_users(
    supabase: AsyncClient, *, user_ids: list[str]
) -> dict[str, dict[str, str | None]]:
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


async def _lookup_workspaces(
    supabase: AsyncClient, *, ids: list[str]
) -> dict[str, dict[str, str]]:
    if not ids:
        return {}
    rows = (
        await supabase.table("workspaces")
        .select("id, name, slug")
        .in_("id", ids)
        .execute()
    ).data
    return {r["id"]: r for r in rows}


def _enrich(
    row: dict,
    *,
    inviter_map: dict[str, dict[str, str | None]] | None = None,
    workspace_map: dict[str, dict[str, str]] | None = None,
) -> InvitationResponse:
    inviter = (inviter_map or {}).get(row["invited_by"], {})
    ws = (workspace_map or {}).get(row["workspace_id"], {})
    return InvitationResponse(
        id=row["id"],
        workspace_id=row["workspace_id"],
        workspace_name=ws.get("name") if ws else None,
        workspace_slug=ws.get("slug") if ws else None,
        invited_email=row["invited_email"],
        role=row["role"],
        status=row["status"],
        invited_by=row["invited_by"],
        invited_by_email=inviter.get("email"),
        invited_by_display_name=inviter.get("display_name"),
        created_at=row["created_at"],
        responded_at=row.get("responded_at"),
        expires_at=row["expires_at"],
    )


# ─── Admin operations ───


async def create_invitation(
    supabase: AsyncClient,
    *,
    user_id: str,
    workspace_id: str,
    email: str,
    role: str = "member",
) -> InvitationResponse:
    """Create a pending invitation. Caller must be owner or admin."""
    caller_role = await _get_caller_role(
        supabase, user_id=user_id, workspace_id=workspace_id
    )
    if caller_role not in ("owner", "admin"):
        raise InvitationPermissionError(
            "Only owner or admin can invite members"
        )

    normalized = email.strip().lower()

    # Already a member? Look the user up by email.
    try:
        users = await supabase.auth.admin.list_users()
    except Exception:
        users = []
    target = next(
        (u for u in users if (u.email or "").lower() == normalized), None
    )
    if target is not None:
        existing_member = (
            await supabase.table("workspace_members")
            .select("user_id")
            .eq("workspace_id", workspace_id)
            .eq("user_id", target.id)
            .execute()
        ).data
        if existing_member:
            raise AlreadyMemberError(target.id)

    # Pending invitation already exists?
    existing_pending = (
        await supabase.table("workspace_invitations")
        .select("id")
        .eq("workspace_id", workspace_id)
        .eq("status", "pending")
        .ilike("invited_email", normalized)
        .execute()
    ).data
    if existing_pending:
        raise InvitationAlreadyExistsError(normalized)

    row = (
        await supabase.table("workspace_invitations")
        .insert(
            {
                "workspace_id": workspace_id,
                "invited_email": normalized,
                "invited_by": user_id,
                "role": role,
            }
        )
        .execute()
    ).data[0]

    # New user → send Supabase's invite email so they sign up and land in
    # the in-app accept flow. Existing users skip this (the API doesn't have a
    # "notify-only" path); they'll see the invitation panel on next /me load,
    # which is enough as long as they revisit the app.
    if target is None:
        try:
            await supabase.auth.admin.invite_user_by_email(
                normalized,
                {
                    "data": {"invited_to_workspace_id": workspace_id},
                    "redirect_to": f"{FRONTEND_URL}/auth/callback",
                },
            )
        except Exception:
            logger.exception(
                "Supabase invite email failed for %s — invitation row "
                "still created, recipient can sign up manually.",
                normalized,
            )

    inviter_map = await _lookup_users(supabase, user_ids=[user_id])
    workspace_map = await _lookup_workspaces(supabase, ids=[workspace_id])
    return _enrich(row, inviter_map=inviter_map, workspace_map=workspace_map)


async def list_workspace_invitations(
    supabase: AsyncClient,
    *,
    user_id: str,
    workspace_id: str,
) -> list[InvitationResponse]:
    """List pending invitations for a workspace. Caller must be owner or admin."""
    caller_role = await _get_caller_role(
        supabase, user_id=user_id, workspace_id=workspace_id
    )
    if caller_role not in ("owner", "admin"):
        raise InvitationPermissionError(
            "Only owner or admin can view invitations"
        )

    rows = (
        await supabase.table("workspace_invitations")
        .select("*")
        .eq("workspace_id", workspace_id)
        .eq("status", "pending")
        .order("created_at", desc=True)
        .execute()
    ).data
    if not rows:
        return []

    inviter_ids = list({r["invited_by"] for r in rows})
    inviter_map = await _lookup_users(supabase, user_ids=inviter_ids)
    return [_enrich(r, inviter_map=inviter_map) for r in rows]


async def revoke_invitation(
    supabase: AsyncClient,
    *,
    user_id: str,
    workspace_id: str,
    invitation_id: str,
) -> None:
    """Mark a pending invitation as revoked. Caller must be owner or admin."""
    caller_role = await _get_caller_role(
        supabase, user_id=user_id, workspace_id=workspace_id
    )
    if caller_role not in ("owner", "admin"):
        raise InvitationPermissionError(
            "Only owner or admin can revoke invitations"
        )

    rows = (
        await supabase.table("workspace_invitations")
        .select("status, workspace_id")
        .eq("id", invitation_id)
        .execute()
    ).data
    if not rows or rows[0]["workspace_id"] != workspace_id:
        raise InvitationNotFoundError(invitation_id)
    if rows[0]["status"] != "pending":
        raise InvitationNotPendingError(rows[0]["status"])

    await supabase.table("workspace_invitations").update(
        {
            "status": "revoked",
            "responded_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", invitation_id).execute()


# ─── Invitee operations ───


async def _resolve_user_email(supabase: AsyncClient, *, user_id: str) -> str | None:
    try:
        users = await supabase.auth.admin.list_users()
        for u in users:
            if u.id == user_id:
                return (u.email or "").lower() or None
    except Exception:
        return None
    return None


async def list_my_invitations(
    supabase: AsyncClient, *, user_id: str
) -> list[InvitationResponse]:
    """Pending invitations targeting the caller's email."""
    my_email = await _resolve_user_email(supabase, user_id=user_id)
    if not my_email:
        return []

    rows = (
        await supabase.table("workspace_invitations")
        .select("*")
        .ilike("invited_email", my_email)
        .eq("status", "pending")
        .order("created_at", desc=True)
        .execute()
    ).data
    if not rows:
        return []

    ws_ids = list({r["workspace_id"] for r in rows})
    inviter_ids = list({r["invited_by"] for r in rows})
    workspace_map = await _lookup_workspaces(supabase, ids=ws_ids)
    inviter_map = await _lookup_users(supabase, user_ids=inviter_ids)
    return [
        _enrich(r, inviter_map=inviter_map, workspace_map=workspace_map)
        for r in rows
    ]


async def _claim_invitation_or_raise(
    supabase: AsyncClient, *, user_id: str, invitation_id: str
) -> tuple[dict, str]:
    """Fetch invitation, verify it targets the caller, return (row, my_email)."""
    rows = (
        await supabase.table("workspace_invitations")
        .select("*")
        .eq("id", invitation_id)
        .execute()
    ).data
    if not rows:
        raise InvitationNotFoundError(invitation_id)
    row = rows[0]

    my_email = await _resolve_user_email(supabase, user_id=user_id)
    if not my_email or my_email != row["invited_email"].lower():
        raise UserEmailMismatchError("Invitation belongs to a different email")

    if row["status"] != "pending":
        raise InvitationNotPendingError(row["status"])

    return row, my_email


async def _notify_inviter(
    supabase: AsyncClient,
    *,
    inviter_id: str,
    invitee_id: str,
    workspace_id: str,
    invited_email: str,
    notif_type: str,
) -> None:
    """Drop a row into notifications so the inviter sees the outcome in their
    bell inbox. Best-effort: if notifications.task_id is still NOT NULL in
    some environment, swallow the error and let invitation-response succeed."""
    if inviter_id == invitee_id:
        return  # don't notify yourself
    ws_rows = (
        await supabase.table("workspaces")
        .select("name")
        .eq("id", workspace_id)
        .execute()
    ).data
    ws_name = ws_rows[0]["name"] if ws_rows else None

    invitee_profiles = await _lookup_users(supabase, user_ids=[invitee_id])
    invitee = invitee_profiles.get(invitee_id, {})
    invitee_label = invitee.get("display_name") or invitee.get("email") or invited_email

    try:
        await supabase.table("notifications").insert(
            {
                "user_id": inviter_id,
                "type": notif_type,
                "actor_id": invitee_id,
                "task_id": None,
                "payload": {
                    "workspace_id": workspace_id,
                    "workspace_name": ws_name,
                    "invitee_email": invited_email,
                    "invitee_label": invitee_label,
                },
            }
        ).execute()
    except Exception:
        logger.exception(
            "Failed to insert invitation notification (type=%s, inviter=%s)",
            notif_type,
            inviter_id,
        )


async def accept_invitation(
    supabase: AsyncClient, *, user_id: str, invitation_id: str
) -> InvitationResponse:
    row, _ = await _claim_invitation_or_raise(
        supabase, user_id=user_id, invitation_id=invitation_id
    )

    workspace_id = row["workspace_id"]

    # Add to workspace_members. Use upsert-style: if already a member (race or
    # duplicate manual add), treat as success and mark the invitation accepted.
    existing_member = (
        await supabase.table("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .execute()
    ).data
    if not existing_member:
        await supabase.table("workspace_members").insert(
            {
                "workspace_id": workspace_id,
                "user_id": user_id,
                "role": row["role"],
            }
        ).execute()

    updated = (
        await supabase.table("workspace_invitations")
        .update(
            {
                "status": "accepted",
                "responded_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .eq("id", invitation_id)
        .execute()
    ).data[0]

    await _notify_inviter(
        supabase,
        inviter_id=row["invited_by"],
        invitee_id=user_id,
        workspace_id=workspace_id,
        invited_email=row["invited_email"],
        notif_type="invitation_accepted",
    )

    workspace_map = await _lookup_workspaces(supabase, ids=[workspace_id])
    inviter_map = await _lookup_users(supabase, user_ids=[row["invited_by"]])
    return _enrich(updated, inviter_map=inviter_map, workspace_map=workspace_map)


async def decline_invitation(
    supabase: AsyncClient, *, user_id: str, invitation_id: str
) -> InvitationResponse:
    row, _ = await _claim_invitation_or_raise(
        supabase, user_id=user_id, invitation_id=invitation_id
    )

    updated = (
        await supabase.table("workspace_invitations")
        .update(
            {
                "status": "declined",
                "responded_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .eq("id", invitation_id)
        .execute()
    ).data[0]

    await _notify_inviter(
        supabase,
        inviter_id=row["invited_by"],
        invitee_id=user_id,
        workspace_id=row["workspace_id"],
        invited_email=row["invited_email"],
        notif_type="invitation_declined",
    )

    workspace_map = await _lookup_workspaces(supabase, ids=[row["workspace_id"]])
    inviter_map = await _lookup_users(supabase, user_ids=[row["invited_by"]])
    return _enrich(updated, inviter_map=inviter_map, workspace_map=workspace_map)
