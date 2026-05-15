from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.core.deps import get_current_user_id, get_supabase_admin
from app.schemas.member import MemberInvite, MemberResponse, MemberRoleUpdate
from app.services.members import (
    AlreadyMemberError,
    CannotModifyOwnerError,
    MemberPermissionError,
    NotAMemberError,
    UserNotFoundError,
    invite_member,
    list_members,
    remove_member,
    update_member_role,
)

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


@router.post(
    "/workspaces/{ws_id}/members",
    response_model=MemberResponse,
    status_code=status.HTTP_201_CREATED,
)
def invite_(
    ws_id: str,
    body: MemberInvite,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return invite_member(supabase, user_id=user_id, workspace_id=ws_id, email=body.email)
    except MemberPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except UserNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No user with email {body.email}",
        ) from exc
    except AlreadyMemberError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a member of this workspace",
        ) from exc


@router.patch(
    "/workspaces/{ws_id}/members/{target_user_id}",
    response_model=MemberResponse,
)
def update_role_(
    ws_id: str,
    target_user_id: str,
    body: MemberRoleUpdate,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return update_member_role(
            supabase,
            user_id=user_id,
            workspace_id=ws_id,
            target_user_id=target_user_id,
            role=body.role,
        )
    except MemberPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except CannotModifyOwnerError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except NotAMemberError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.delete(
    "/workspaces/{ws_id}/members/{target_user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_(
    ws_id: str,
    target_user_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        remove_member(
            supabase,
            user_id=user_id,
            workspace_id=ws_id,
            target_user_id=target_user_id,
        )
    except MemberPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except CannotModifyOwnerError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except NotAMemberError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
