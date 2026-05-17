from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

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
def create_(
    ws_id: str,
    body: InvitationCreate,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return create_invitation(
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
def list_(
    ws_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return list_workspace_invitations(
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
def revoke_(
    ws_id: str,
    invitation_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        revoke_invitation(
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
def list_mine_(
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    return list_my_invitations(supabase, user_id=user_id)


@router.post(
    "/invitations/{invitation_id}/accept",
    response_model=InvitationResponse,
)
def accept_(
    invitation_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return accept_invitation(
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
def decline_(
    invitation_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return decline_invitation(
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
