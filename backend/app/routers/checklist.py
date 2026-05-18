from fastapi import APIRouter, Depends, HTTPException, status
from supabase import AsyncClient

from app.core.deps import get_current_user_id, get_supabase_admin
from app.schemas.checklist import (
    ChecklistItemCreate,
    ChecklistItemResponse,
    ChecklistItemUpdate,
)
from app.services.checklist import (
    ChecklistNotFoundError,
    ChecklistPermissionError,
    TaskNotFoundError,
    create_item,
    delete_item,
    list_items,
    update_item,
)

router = APIRouter(tags=["checklist"])


@router.get(
    "/tasks/{t_id}/checklist",
    response_model=list[ChecklistItemResponse],
)
async def list_(
    t_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        return await list_items(supabase, user_id=user_id, task_id=t_id)
    except ChecklistPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except TaskNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.post(
    "/tasks/{t_id}/checklist",
    response_model=ChecklistItemResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create(
    t_id: str,
    payload: ChecklistItemCreate,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        return await create_item(
            supabase, user_id=user_id, task_id=t_id, payload=payload
        )
    except ChecklistPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except TaskNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.patch(
    "/checklist/{i_id}",
    response_model=ChecklistItemResponse,
)
async def update(
    i_id: str,
    payload: ChecklistItemUpdate,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        return await update_item(
            supabase, user_id=user_id, item_id=i_id, payload=payload
        )
    except ChecklistPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except ChecklistNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.delete("/checklist/{i_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(
    i_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        await delete_item(supabase, user_id=user_id, item_id=i_id)
    except ChecklistPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except ChecklistNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
