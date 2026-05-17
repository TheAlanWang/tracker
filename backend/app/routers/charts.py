from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

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
def burndown(
    s_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return compute_burndown(supabase, user_id=user_id, sprint_id=s_id)
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
def velocity(
    p_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return compute_velocity(supabase, user_id=user_id, project_id=p_id)
    except ChartPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except SprintNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
