"""Notification business logic. Notifications are personal (user-scoped)."""

from datetime import datetime, timezone

from supabase import Client

from app.schemas.notification import NotificationResponse


class NotificationError(Exception):
    pass


class NotificationNotFoundError(NotificationError):
    pass


class NotificationPermissionError(NotificationError):
    pass


def list_my_notifications(
    supabase: Client,
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
    rows = query.limit(50).execute().data
    return [NotificationResponse(**r) for r in rows]


def mark_read(
    supabase: Client,
    *,
    user_id: str,
    notification_id: str,
) -> None:
    row = (
        supabase.table("notifications")
        .select("id, user_id")
        .eq("id", notification_id)
        .single()
        .execute()
        .data
    )
    if not row:
        raise NotificationNotFoundError(notification_id)
    if row["user_id"] != user_id:
        raise NotificationPermissionError(notification_id)
    (
        supabase.table("notifications")
        .update({"read_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", notification_id)
        .execute()
    )


def mark_all_read(
    supabase: Client,
    *,
    user_id: str,
) -> int:
    rows = (
        supabase.table("notifications")
        .update({"read_at": datetime.now(timezone.utc).isoformat()})
        .eq("user_id", user_id)
        .is_("read_at", "null")
        .execute()
        .data
    )
    return len(rows)
