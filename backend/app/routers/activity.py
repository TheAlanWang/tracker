from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from supabase import AsyncClient

from app.core.deps import get_current_user_id, get_supabase_admin
from app.schemas.activity import ActivityResponse, MyActivityResponse
from app.services.activity import (
    ActivityPermissionError,
    TaskNotFoundError,
    list_my_activity,
    list_task_activity,
)

router = APIRouter(tags=["activity"])


@router.get("/tasks/{t_id}/activity", response_model=list[ActivityResponse])
async def list_activity(
    t_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        return await list_task_activity(supabase, user_id=user_id, task_id=t_id)
    except TaskNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
    except ActivityPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc


@router.get("/me/activity", response_model=list[MyActivityResponse])
async def list_my_activity_endpoint(
    since: datetime | None = Query(
        None,
        description="ISO 8601 datetime, e.g. 2026-05-20T00:00:00Z. Returns only entries at or after this time.",
    ),
    limit: int = Query(50, ge=1, le=200),
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    """Recent activity authored by the current user across all their
    workspaces. Designed for 'what did I do yesterday' AI standup
    queries; results include `task_identifier` for human-friendly
    reference."""
    return await list_my_activity(
        supabase, user_id=user_id, since=since, limit=limit
    )
