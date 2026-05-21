from fastapi import APIRouter, Depends, HTTPException, status
from supabase import AsyncClient

from app.core.deps import get_current_user_id, get_supabase_admin
from app.schemas.charts import BurndownResponse, VelocityResponse
from app.services.charts import (
    PermissionError as ChartPermissionError,
    SprintNoDatesError,
    SprintNotFoundError,
    compute_burndown,
    compute_velocity,
)

router = APIRouter(tags=["charts"])


@router.get(
    "/sprints/{s_id}/burndown",
    response_model=BurndownResponse,
)
async def burndown(
    s_id: str,
    today: str | None = None,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        return await compute_burndown(
            supabase, user_id=user_id, sprint_id=s_id, today=today
        )
    except ChartPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except SprintNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
    except SprintNoDatesError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Sprint has no start/end dates — set them to view burndown.",
        ) from exc


@router.get(
    "/projects/{p_id}/velocity",
    response_model=VelocityResponse,
)
async def velocity(
    p_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        return await compute_velocity(supabase, user_id=user_id, project_id=p_id)
    except ChartPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except SprintNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
