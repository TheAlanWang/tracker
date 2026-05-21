"""Notification business logic. Notifications are personal (user-scoped)."""

from datetime import datetime, timezone

from supabase import AsyncClient

from app.schemas.notification import NotificationResponse
from app.services._user_profiles import user_profile_from_auth


class NotificationError(Exception):
    pass


class NotificationNotFoundError(NotificationError):
    pass


class NotificationPermissionError(NotificationError):
    pass


async def list_my_notifications(
    supabase: AsyncClient,
    *,
    user_id: str,
    unread_only: bool = False,
) -> list[NotificationResponse]:
    query = (
        supabase.table("notifications")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
    )
    if unread_only:
        query = query.is_("read_at", "null")
    rows = (await query.limit(50).execute()).data

    # Enrich with actor profile from auth.users (so the UI can show
    # "Assigned by Alan" / "by alan@gmail.com" instead of a UUID, and
    # render the actor's picked avatar background color).
    actor_ids = list({r["actor_id"] for r in rows if r.get("actor_id")})
    actor_info: dict[str, dict[str, str | None]] = {}
    if actor_ids:
        try:
            users = await supabase.auth.admin.list_users()
            for u in users:
                if u.id in actor_ids:
                    actor_info[u.id] = user_profile_from_auth(u)
        except Exception:
            pass  # graceful: row falls back to UUID display

    enriched: list[NotificationResponse] = []
    for r in rows:
        info = actor_info.get(r.get("actor_id") or "", {})
        enriched.append(
            NotificationResponse(
                **r,
                actor_email=info.get("email"),
                actor_display_name=info.get("display_name"),
                actor_avatar_url=info.get("avatar_url"),
                actor_avatar_color=info.get("avatar_color"),
            )
        )
    return enriched


async def mark_read(
    supabase: AsyncClient,
    *,
    user_id: str,
    notification_id: str,
) -> None:
    row = (
        await supabase.table("notifications")
        .select("id, user_id")
        .eq("id", notification_id)
        .single()
        .execute()
    ).data
    if not row:
        raise NotificationNotFoundError(notification_id)
    if row["user_id"] != user_id:
        raise NotificationPermissionError(notification_id)
    await (
        supabase.table("notifications")
        .update({"read_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", notification_id)
        .execute()
    )


async def mark_all_read(
    supabase: AsyncClient,
    *,
    user_id: str,
) -> int:
    rows = (
        await supabase.table("notifications")
        .update({"read_at": datetime.now(timezone.utc).isoformat()})
        .eq("user_id", user_id)
        .is_("read_at", "null")
        .execute()
    ).data
    return len(rows)
