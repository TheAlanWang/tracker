from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.core.deps import get_current_user_id, get_supabase_admin
from app.schemas.activity import ActivityResponse
from app.services.activity import (
    ActivityPermissionError,
    IssueNotFoundError,
    list_issue_activity,
)

router = APIRouter(tags=["activity"])


@router.get("/issues/{i_id}/activity", response_model=list[ActivityResponse])
def list_activity(
    i_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return list_issue_activity(supabase, user_id=user_id, issue_id=i_id)
    except IssueNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
    except ActivityPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
