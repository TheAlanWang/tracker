from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.core.deps import get_current_user_id, get_supabase_admin
from app.schemas.member import MemberResponse
from app.services.members import NotAMemberError, list_members

router = APIRouter(tags=["members"])


@router.get(
    "/workspaces/{ws_id}/members", response_model=list[MemberResponse]
)
def list_(
    ws_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return list_members(supabase, user_id=user_id, workspace_id=ws_id)
    except NotAMemberError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
