from fastapi import APIRouter, Depends, HTTPException, status
from supabase import AsyncClient

from app.core.deps import get_current_user_id, get_supabase_admin
from app.schemas.invitation import InvitationCreate, InvitationResponse
from app.services.invitations import (
    AlreadyMemberError,
    InvitationAlreadyExistsError,
    InvitationNotFoundError,
    InvitationNotPendingError,
    InvitationPermissionError,
    UserEmailMismatchError,
    accept_invitation,
    create_invitation,
    decline_invitation,
    list_my_invitations,
    list_workspace_invitations,
    revoke_invitation,
)

router = APIRouter(tags=["invitations"])


# ─── Admin: per-workspace ───


@router.post(
    "/workspaces/{ws_id}/invitations",
    response_model=InvitationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_(
    ws_id: str,
    body: InvitationCreate,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        return await create_invitation(
            supabase,
            user_id=user_id,
            workspace_id=ws_id,
            email=body.email,
            role=body.role,
        )
    except InvitationPermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)
        ) from exc
    except AlreadyMemberError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a member of this workspace",
        ) from exc
    except InvitationAlreadyExistsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An invitation for this email is already pending",
        ) from exc


@router.get(
    "/workspaces/{ws_id}/invitations",
    response_model=list[InvitationResponse],
)
async def list_(
    ws_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        return await list_workspace_invitations(
            supabase, user_id=user_id, workspace_id=ws_id
        )
    except InvitationPermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)
        ) from exc


@router.delete(
    "/workspaces/{ws_id}/invitations/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def revoke_(
    ws_id: str,
    invitation_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        await revoke_invitation(
            supabase,
            user_id=user_id,
            workspace_id=ws_id,
            invitation_id=invitation_id,
        )
    except InvitationPermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)
        ) from exc
    except InvitationNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found"
        ) from exc
    except InvitationNotPendingError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Invitation is {exc.args[0]}",
        ) from exc


# ─── Invitee: current user's pending invites ───


@router.get("/me/invitations", response_model=list[InvitationResponse])
async def list_mine_(
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    return await list_my_invitations(supabase, user_id=user_id)


@router.post(
    "/invitations/{invitation_id}/accept",
    response_model=InvitationResponse,
)
async def accept_(
    invitation_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        return await accept_invitation(
            supabase, user_id=user_id, invitation_id=invitation_id
        )
    except InvitationNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found"
        ) from exc
    except UserEmailMismatchError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)
        ) from exc
    except InvitationNotPendingError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Invitation is {exc.args[0]}",
        ) from exc


@router.post(
    "/invitations/{invitation_id}/decline",
    response_model=InvitationResponse,
)
async def decline_(
    invitation_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        return await decline_invitation(
            supabase, user_id=user_id, invitation_id=invitation_id
        )
    except InvitationNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found"
        ) from exc
    except UserEmailMismatchError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)
        ) from exc
    except InvitationNotPendingError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Invitation is {exc.args[0]}",
        ) from exc
