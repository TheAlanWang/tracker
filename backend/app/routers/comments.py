from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.core.deps import get_current_user_id, get_supabase_admin
from app.schemas.comment import CommentCreate, CommentResponse, CommentUpdate
from app.services.comments import (
    CommentNotFoundError,
    CommentPermissionError,
    TaskNotFoundError,
    create_comment,
    delete_comment,
    list_comments,
    update_comment,
)

router = APIRouter(tags=["comments"])


@router.get("/tasks/{t_id}/comments", response_model=list[CommentResponse])
def list_(
    t_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return list_comments(supabase, user_id=user_id, task_id=t_id)
    except CommentPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except TaskNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.post(
    "/tasks/{t_id}/comments",
    response_model=CommentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create(
    t_id: str,
    payload: CommentCreate,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return create_comment(supabase, user_id=user_id, task_id=t_id, payload=payload)
    except CommentPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except TaskNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.patch("/comments/{c_id}", response_model=CommentResponse)
def update(
    c_id: str,
    payload: CommentUpdate,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return update_comment(
            supabase, user_id=user_id, comment_id=c_id, payload=payload
        )
    except CommentPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except CommentNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.delete("/comments/{c_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(
    c_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        delete_comment(supabase, user_id=user_id, comment_id=c_id)
    except CommentPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except CommentNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
