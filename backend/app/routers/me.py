from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client

from app.core.config import Settings, get_settings
from app.core.deps import get_current_user_id, get_supabase_admin
from app.core.security import (
    InvalidTokenError,
    verify_and_decode_supabase_jwt,
)
from app.schemas.user import MeResponse, WorkspaceSummary
from app.services.workspaces import list_workspaces_for_user

router = APIRouter()

bearer_scheme = HTTPBearer(auto_error=False)


@router.get("/me", response_model=MeResponse)
def get_me(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    user_id: str = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
    supabase: Client = Depends(get_supabase_admin),
) -> MeResponse:
    email: str | None = None
    if creds is not None:
        try:
            payload = verify_and_decode_supabase_jwt(
                creds.credentials, settings.supabase_jwt_secret
            )
            email = payload.get("email")
        except InvalidTokenError:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    workspaces = list_workspaces_for_user(supabase, user_id=user_id)
    workspace_summaries = [
        WorkspaceSummary(id=w.id, slug=w.slug, name=w.name) for w in workspaces
    ]

    return MeResponse(id=user_id, email=email, workspaces=workspace_summaries)
