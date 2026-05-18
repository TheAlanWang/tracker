from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import AsyncClient, acreate_client

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


async def get_supabase_admin(
    user_id: str = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> AsyncClient:
    """Per-request AsyncClient with JWT role=service_role + sub=user_id.

    Per-request (not cached): the token lives on the client's PostgREST
    header dict, mutating a shared singleton is unsafe under concurrency.
    `acreate_client` doesn't hit the network.

    Async so service functions can `await ...execute()` and fan out N
    independent queries via `asyncio.gather(...)`.
    """
    client = await acreate_client(
        settings.supabase_url, settings.supabase_service_key
    )
    token = mint_service_jwt_for_user(user_id, settings.supabase_jwt_secret)
    client.postgrest.auth(token)  # sync — mutates header dict
    return client
