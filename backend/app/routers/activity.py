from fastapi import APIRouter, Depends, HTTPException, status
from supabase import AsyncClient

from app.core.deps import get_current_user_id, get_supabase_admin
from app.schemas.activity import ActivityResponse
from app.services.activity import (
    ActivityPermissionError,
    TaskNotFoundError,
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
