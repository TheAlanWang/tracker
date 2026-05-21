"""Shared user-profile shape for endpoints that embed other users.

The auth.admin.list_users() / get_user_by_id() responses bury everything
the UI needs to render a member (email, display_name, avatar_url,
avatar_color) inside user_metadata. Members / notifications / dashboard
activity all need the same projection — kept here so adding a new field
(e.g. timezone) only requires one edit, not three.
"""

from typing import Any


def user_profile_from_auth(user: Any) -> dict[str, str | None]:
    """Project a supabase admin user object → UI-facing profile fields."""
    meta = user.user_metadata or {}
    return {
        "email": user.email,
        "display_name": meta.get("display_name"),
        "avatar_url": meta.get("avatar_url"),
        "avatar_color": meta.get("avatar_color"),
    }
