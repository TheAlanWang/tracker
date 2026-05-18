import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import AsyncClient

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
async def get_me(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    user_id: str = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
    supabase: AsyncClient = Depends(get_supabase_admin),
) -> MeResponse:
    email: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
    if creds is not None:
        try:
            payload = verify_and_decode_supabase_jwt(
                creds.credentials, settings.supabase_jwt_secret
            )
            email = payload.get("email")
            user_meta = payload.get("user_metadata") or {}
            display_name = user_meta.get("display_name")
            avatar_url = user_meta.get("avatar_url")
        except InvalidTokenError:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    workspaces = await list_workspaces_for_user(supabase, user_id=user_id)
    workspace_summaries = [
        WorkspaceSummary(id=w.id, slug=w.slug, name=w.name) for w in workspaces
    ]

    return MeResponse(
        id=user_id,
        email=email,
        display_name=display_name,
        avatar_url=avatar_url,
        workspaces=workspace_summaries,
    )


@router.patch("/me/profile", response_model=MeResponse)
async def update_profile(
    body: ProfileUpdate,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    user_id: str = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
    supabase: AsyncClient = Depends(get_supabase_admin),
) -> MeResponse:
    updates: dict = {}
    if body.display_name is not None:
        updates["display_name"] = body.display_name
    if body.avatar_url is not None:
        # Empty string clears the avatar — converted to None so the metadata
        # field disappears instead of holding "".
        updates["avatar_url"] = body.avatar_url or None

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
    avatar_url: str | None = None
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
        user_obj = await supabase.auth.admin.get_user_by_id(user_id)
        if user_obj and user_obj.user:
            email = email or user_obj.user.email
            meta = user_obj.user.user_metadata or {}
            display_name = meta.get("display_name")
            avatar_url = meta.get("avatar_url")
    except Exception:
        pass

    workspaces = await list_workspaces_for_user(supabase, user_id=user_id)
    workspace_summaries = [
        WorkspaceSummary(id=w.id, slug=w.slug, name=w.name) for w in workspaces
    ]

    return MeResponse(
        id=user_id,
        email=email,
        display_name=display_name,
        avatar_url=avatar_url,
        workspaces=workspace_summaries,
    )


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    """Permanently delete the caller's account.

    Deletes auth.users(id = user_id); FK cascades take care of the rest:
      - workspaces.owner_id CASCADE     → owned workspaces and everything in
                                          them (projects, tasks, sprints,
                                          watchers, activity, etc.)
      - workspace_members.user_id CASCADE → membership in other workspaces
      - task_watchers.user_id CASCADE     → watch subscriptions
      - workspace_invitations.invited_by CASCADE → invites they sent
      - notifications.user_id CASCADE     → their inbox

    Tasks/comments/activity they touched in OTHER workspaces stay (FK SET
    NULL), so collaborators don't lose work; their attribution just becomes
    "Someone".
    """
    try:
        await supabase.auth.admin.delete_user(user_id)
    except Exception as exc:
        logger.exception("Failed to delete user %s", user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete account",
        ) from exc


@router.get("/me/dashboard", response_model=DashboardResponse)
async def get_dashboard_endpoint(
    workspace_id: str | None = None,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
) -> DashboardResponse:
    return await get_dashboard(supabase, user_id=user_id, workspace_id=workspace_id)
