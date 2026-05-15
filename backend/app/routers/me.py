from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import Settings, get_settings
from app.core.deps import get_current_user_id
from app.core.security import (
    InvalidTokenError,
    verify_and_decode_supabase_jwt,
)
from app.schemas.user import MeResponse

router = APIRouter()

bearer_scheme = HTTPBearer(auto_error=False)


@router.get("/me", response_model=MeResponse)
def get_me(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    user_id: str = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> MeResponse:
    # Reach back into the token to extract email claim. Plan 2 will pull from
    # auth.users via service role instead.
    email: str | None = None
    if creds is not None:
        try:
            payload = verify_and_decode_supabase_jwt(
                creds.credentials, settings.supabase_jwt_secret
            )
            email = payload.get("email")
        except InvalidTokenError:
            # Token was already validated by get_current_user_id; this is unreachable.
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    return MeResponse(id=user_id, email=email, workspaces=[])
