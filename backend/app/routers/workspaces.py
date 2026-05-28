from fastapi import APIRouter, Depends, HTTPException, status
from supabase import AsyncClient

from app.core.deps import get_current_user_id, get_supabase_admin
from app.schemas.workspace import (
    WorkspaceCreate,
    WorkspaceResponse,
    WorkspaceUpdate,
    WorkspaceUsageResponse,
)
from app.services.workspaces import (
    WorkspaceNotFoundError,
    WorkspacePermissionError,
    WorkspaceSlugExistsError,
    create_workspace,
    delete_workspace,
    get_workspace,
    get_workspace_storage_bytes,
    list_workspaces_for_user,
    update_workspace,
)

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@router.get("", response_model=list[WorkspaceResponse])
async def list_(
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    return await list_workspaces_for_user(supabase, user_id=user_id)


@router.post("", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
async def create(
    payload: WorkspaceCreate,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        return await create_workspace(supabase, user_id=user_id, payload=payload)
    except WorkspaceSlugExistsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Slug '{exc}' already in use",
        ) from exc


@router.get("/{ws_id}", response_model=WorkspaceResponse)
async def get(
    ws_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        return await get_workspace(supabase, user_id=user_id, workspace_id=ws_id)
    except WorkspacePermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except WorkspaceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.get("/{ws_id}/usage", response_model=WorkspaceUsageResponse)
async def usage(
    ws_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        storage_bytes = await get_workspace_storage_bytes(
            supabase, user_id=user_id, workspace_id=ws_id
        )
        return WorkspaceUsageResponse(storage_bytes=storage_bytes)
    except WorkspacePermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc


@router.patch("/{ws_id}", response_model=WorkspaceResponse)
async def update(
    ws_id: str,
    payload: WorkspaceUpdate,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        return await update_workspace(
            supabase, user_id=user_id, workspace_id=ws_id, payload=payload
        )
    except WorkspacePermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except WorkspaceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
    except WorkspaceSlugExistsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Slug '{exc}' already in use",
        ) from exc


@router.delete("/{ws_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(
    ws_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        await delete_workspace(supabase, user_id=user_id, workspace_id=ws_id)
    except WorkspacePermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except WorkspaceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
