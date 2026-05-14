import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import Settings, get_settings
from app.core.deps import get_current_user_id
from app.schemas.user import MeResponse

router = APIRouter()

bearer_scheme = HTTPBearer(auto_error=False)


@router.get("/me", response_model=MeResponse)
def get_me(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    user_id: str = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> MeResponse:
    # Reach back into the token to extract email claim (cheap; avoids a DB
    # round-trip for now). Plan 2 will pull from auth.users via service role.
    email: str | None = None
    if creds is not None:
        try:
            payload = jwt.decode(
                creds.credentials,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
            email = payload.get("email")
        except Exception:
            # Token was already validated by get_current_user_id; if we get
            # here, something is very wrong.
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return MeResponse(id=user_id, email=email, workspaces=[])
