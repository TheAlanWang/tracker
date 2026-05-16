import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client

from app.core.config import Settings, get_settings
from app.core.deps import get_current_user_id, get_supabase_admin
from app.core.security import (
    InvalidTokenError,
    verify_and_decode_supabase_jwt,
)
from app.schemas.dashboard import DashboardResponse
from app.schemas.user import MeResponse, ProfileUpdate, WorkspaceSummary
from app.services.dashboard import get_dashboard
from app.services.workspaces import list_workspaces_for_user

logger = logging.getLogger(__name__)

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
    display_name: str | None = None
    if creds is not None:
        try:
            payload = verify_and_decode_supabase_jwt(
                creds.credentials, settings.supabase_jwt_secret
            )
            email = payload.get("email")
            user_meta = payload.get("user_metadata") or {}
            display_name = user_meta.get("display_name")
        except InvalidTokenError:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    workspaces = list_workspaces_for_user(supabase, user_id=user_id)
    workspace_summaries = [
        WorkspaceSummary(id=w.id, slug=w.slug, name=w.name) for w in workspaces
    ]

    return MeResponse(
        id=user_id,
        email=email,
        display_name=display_name,
        workspaces=workspace_summaries,
    )


@router.patch("/me/profile", response_model=MeResponse)
def update_profile(
    body: ProfileUpdate,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    user_id: str = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
    supabase: Client = Depends(get_supabase_admin),
) -> MeResponse:
    updates: dict = {}
    if body.display_name is not None:
        updates["display_name"] = body.display_name

    if updates:
        try:
            supabase.auth.admin.update_user_by_id(
                user_id, {"user_metadata": updates}
            )
        except Exception as exc:
            logger.exception("Failed to update user metadata for %s", user_id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update profile",
            ) from exc

    # Re-read from the admin API to get fresh metadata
    email: str | None = None
    display_name: str | None = None
    if creds is not None:
        try:
            payload = verify_and_decode_supabase_jwt(
                creds.credentials, settings.supabase_jwt_secret
            )
            email = payload.get("email")
        except InvalidTokenError:
            pass

    # Fetch updated user from admin API for fresh metadata
    try:
        user_obj = supabase.auth.admin.get_user_by_id(user_id)
        if user_obj and user_obj.user:
            email = email or user_obj.user.email
            meta = user_obj.user.user_metadata or {}
            display_name = meta.get("display_name")
    except Exception:
        pass

    workspaces = list_workspaces_for_user(supabase, user_id=user_id)
    workspace_summaries = [
        WorkspaceSummary(id=w.id, slug=w.slug, name=w.name) for w in workspaces
    ]

    return MeResponse(
        id=user_id,
        email=email,
        display_name=display_name,
        workspaces=workspace_summaries,
    )


@router.get("/me/dashboard", response_model=DashboardResponse)
def get_dashboard_endpoint(
    workspace_id: str | None = None,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
) -> DashboardResponse:
    return get_dashboard(supabase, user_id=user_id, workspace_id=workspace_id)
