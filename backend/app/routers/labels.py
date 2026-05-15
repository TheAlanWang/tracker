from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.core.deps import get_current_user_id, get_supabase_admin
from app.schemas.label import LabelCreate, LabelResponse
from app.services.labels import (
    IssueNotFoundError,
    LabelNameExistsError,
    LabelNotFoundError,
    LabelPermissionError,
    attach_label,
    create_label,
    delete_label,
    detach_label,
    list_issue_labels,
    list_labels,
)

router = APIRouter(tags=["labels"])


@router.get("/workspaces/{ws_id}/labels", response_model=list[LabelResponse])
def list_(
    ws_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return list_labels(supabase, user_id=user_id, workspace_id=ws_id)
    except LabelPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc


@router.post(
    "/workspaces/{ws_id}/labels",
    response_model=LabelResponse,
    status_code=status.HTTP_201_CREATED,
)
def create(
    ws_id: str,
    payload: LabelCreate,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return create_label(supabase, user_id=user_id, workspace_id=ws_id, payload=payload)
    except LabelPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except LabelNameExistsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Label '{exc}' already exists in this workspace",
        ) from exc


@router.delete("/labels/{l_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(
    l_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        delete_label(supabase, user_id=user_id, label_id=l_id)
    except LabelPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except LabelNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.get("/issues/{i_id}/labels", response_model=list[LabelResponse])
def list_issue_(
    i_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return list_issue_labels(supabase, user_id=user_id, issue_id=i_id)
    except LabelPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except IssueNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.post(
    "/issues/{i_id}/labels/{l_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def attach(
    i_id: str,
    l_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        attach_label(supabase, user_id=user_id, issue_id=i_id, label_id=l_id)
    except LabelPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except (IssueNotFoundError, LabelNotFoundError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.delete(
    "/issues/{i_id}/labels/{l_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def detach(
    i_id: str,
    l_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        detach_label(supabase, user_id=user_id, issue_id=i_id, label_id=l_id)
    except LabelPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except IssueNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
