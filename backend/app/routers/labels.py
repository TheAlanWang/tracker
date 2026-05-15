from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.core.deps import get_current_user_id, get_supabase_admin
from app.schemas.label import LabelCreate, LabelResponse
from app.services.labels import (
    TaskNotFoundError,
    LabelNameExistsError,
    LabelNotFoundError,
    LabelPermissionError,
    attach_label,
    create_label,
    delete_label,
    detach_label,
    list_task_labels,
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


@router.get("/tasks/{t_id}/labels", response_model=list[LabelResponse])
def list_task_(
    t_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return list_task_labels(supabase, user_id=user_id, task_id=t_id)
    except LabelPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except TaskNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.post(
    "/tasks/{t_id}/labels/{l_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def attach(
    t_id: str,
    l_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        attach_label(supabase, user_id=user_id, task_id=t_id, label_id=l_id)
    except LabelPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except (TaskNotFoundError, LabelNotFoundError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.delete(
    "/tasks/{t_id}/labels/{l_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def detach(
    t_id: str,
    l_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        detach_label(supabase, user_id=user_id, task_id=t_id, label_id=l_id)
    except LabelPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except TaskNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
