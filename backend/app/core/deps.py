from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client, create_client

from app.core.config import Settings, get_settings
from app.core.security import (
    InvalidTokenError,
    mint_service_jwt_for_user,
    verify_supabase_jwt,
)

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user_id(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    settings: Settings = Depends(get_settings),
) -> str:
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )

    try:
        return verify_supabase_jwt(creds.credentials, settings.supabase_jwt_secret)
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc


def get_supabase_admin(
    user_id: str = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> Client:
    """Return a Supabase client whose JWT is service_role + sub=user_id.

    Why a fresh client per request: the auth token lives on the client's
    PostgREST header dict. Mutating a shared singleton is unsafe under
    concurrent requests. supabase-py's client init is cheap (no network).

    Why role=service_role + sub=user_id: PostgREST uses `role` to bypass
    RLS (preserving our existing service-layer permission model), while
    triggers and policies that call `auth.uid()` see the real user.
    """
    client = create_client(settings.supabase_url, settings.supabase_service_key)
    token = mint_service_jwt_for_user(user_id, settings.supabase_jwt_secret)
    client.postgrest.auth(token)
    return client
