"""Shared user-profile lookups for endpoints that embed other users.

Members / watchers / notifications / dashboard activity / mentions /
invitations all need the same projection of another user (email,
display_name, avatar_url, avatar_color) — kept here so adding a new field
(e.g. timezone) only requires one edit.

Lookups go through the `get_user_profiles` / `find_user_id_by_email` SQL
functions, which fetch only the requested rows. Do NOT use
auth.admin.list_users() for this: it is paginated, so users past the first
page silently disappear, and it pulls every user on every request.
"""

import logging
from typing import Any

from supabase import AsyncClient

logger = logging.getLogger(__name__)

# Page size for the list_users fallback below (GoTrue caps per_page at 1000).
_FALLBACK_PER_PAGE = 1000


def user_profile_from_auth(user: Any) -> dict[str, str | None]:
    """Project a supabase admin user object → UI-facing profile fields."""
    meta = user.user_metadata or {}
    return {
        "email": user.email,
        "display_name": meta.get("display_name"),
        "avatar_url": meta.get("avatar_url"),
        "avatar_color": meta.get("avatar_color"),
    }


async def _list_all_users(supabase: AsyncClient) -> list[Any]:
    """Every auth user, walking all pages.

    Only a fallback for the window where new code is deployed but the
    migration adding the lookup functions hasn't run on the database yet.
    """
    users: list[Any] = []
    page = 1
    while True:
        batch = await supabase.auth.admin.list_users(
            page=page, per_page=_FALLBACK_PER_PAGE
        )
        users.extend(batch)
        if len(batch) < _FALLBACK_PER_PAGE:
            return users
        page += 1


async def fetch_user_profiles(
    supabase: AsyncClient, user_ids: Any, *, workspace_id: str | None = None
) -> dict[str, dict[str, str | None]]:
    """Return user_id -> {email, display_name, avatar_url, avatar_color}.

    With `workspace_id`, a member's workspace nickname (if set) replaces
    `display_name`, and the global name is kept as `profile_display_name`.

    Unknown ids are simply absent. Never raises: on failure returns what it
    could find (callers fall back to rendering the raw id / "Someone").
    """
    ids = sorted({str(i) for i in user_ids if i})
    if not ids:
        return {}
    profiles = await _fetch_global_profiles(supabase, ids)
    if workspace_id:
        await _overlay_nicknames(supabase, profiles, workspace_id)
    return profiles


async def _overlay_nicknames(
    supabase: AsyncClient,
    profiles: dict[str, dict[str, str | None]],
    workspace_id: str,
) -> None:
    try:
        rows = (
            await supabase.table("workspace_members")
            .select("user_id, nickname")
            .eq("workspace_id", workspace_id)
            .in_("user_id", list(profiles))
            .execute()
        ).data or []
    except Exception:
        # e.g. the nickname column isn't migrated yet — global names only.
        logger.warning("workspace nickname lookup failed; using global names")
        return
    for r in rows:
        p = profiles.get(str(r["user_id"]))
        if p is None:
            continue
        p["profile_display_name"] = p.get("display_name")
        if r.get("nickname"):
            p["display_name"] = r["nickname"]


async def _fetch_global_profiles(
    supabase: AsyncClient, ids: list[str]
) -> dict[str, dict[str, str | None]]:
    try:
        rows = (
            await supabase.rpc("get_user_profiles", {"uids": ids}).execute()
        ).data or []
        return {
            str(r["id"]): {
                "email": r.get("email"),
                "display_name": r.get("display_name"),
                "avatar_url": r.get("avatar_url"),
                "avatar_color": r.get("avatar_color"),
            }
            for r in rows
        }
    except Exception:
        logger.warning("get_user_profiles rpc failed; using list_users fallback")
    try:
        wanted = set(ids)
        return {
            u.id: user_profile_from_auth(u)
            for u in await _list_all_users(supabase)
            if u.id in wanted
        }
    except Exception:
        logger.exception("user profile lookup failed")
        return {}


async def find_user_id_by_email(supabase: AsyncClient, email: str) -> str | None:
    """Return the auth user id registered with `email` (case-insensitive)."""
    normalized = email.strip().lower()
    if not normalized:
        return None
    try:
        result = await supabase.rpc(
            "find_user_id_by_email", {"p_email": normalized}
        ).execute()
        return str(result.data) if result.data else None
    except Exception:
        logger.warning("find_user_id_by_email rpc failed; using list_users fallback")
    try:
        for u in await _list_all_users(supabase):
            if (u.email or "").lower() == normalized:
                return u.id
    except Exception:
        logger.exception("user lookup by email failed")
    return None
