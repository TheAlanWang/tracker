from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.core.deps import get_current_user_id, get_supabase_admin
from app.schemas.notification import NotificationResponse
from app.services.notifications import (
    NotificationNotFoundError,
    NotificationPermissionError,
    list_my_notifications,
    mark_all_read,
    mark_read,
)

router = APIRouter(tags=["notifications"])


@router.get("/me/notifications", response_model=list[NotificationResponse])
def list_notifications(
    unread_only: bool = False,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    return list_my_notifications(supabase, user_id=user_id, unread_only=unread_only)


@router.post(
    "/notifications/{n_id}/read",
    status_code=status.HTTP_204_NO_CONTENT,
)
def mark_notification_read(
    n_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        mark_read(supabase, user_id=user_id, notification_id=n_id)
    except NotificationNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
    except NotificationPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc


@router.post("/me/notifications/read-all")
def mark_all_notifications_read(
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    count = mark_all_read(supabase, user_id=user_id)
    return {"count": count}
