from fastapi import APIRouter, Depends, HTTPException, status
from supabase import AsyncClient

from app.core.deps import get_current_user_id, get_supabase_admin
from app.schemas.watcher import WatcherResponse, WatchedTaskResponse
from app.services.watchers import (
    TaskNotFoundError,
    WatcherPermissionError,
    list_my_watched_tasks,
    list_task_watchers,
    unwatch_task,
    watch_task,
)

router = APIRouter(tags=["watchers"])


@router.post(
    "/tasks/{task_id}/watchers",
    response_model=WatcherResponse,
    status_code=status.HTTP_201_CREATED,
)
async def watch_(
    task_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        return await watch_task(supabase, user_id=user_id, task_id=task_id)
    except TaskNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Task not found"
        ) from exc
    except WatcherPermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        ) from exc


@router.delete(
    "/tasks/{task_id}/watchers/me",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def unwatch_(
    task_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        await unwatch_task(supabase, user_id=user_id, task_id=task_id)
    except TaskNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Task not found"
        ) from exc
    except WatcherPermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        ) from exc


@router.get(
    "/tasks/{task_id}/watchers",
    response_model=list[WatcherResponse],
)
async def list_(
    task_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        return await list_task_watchers(supabase, user_id=user_id, task_id=task_id)
    except TaskNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Task not found"
        ) from exc
    except WatcherPermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        ) from exc


@router.get(
    "/me/watched-tasks",
    response_model=list[WatchedTaskResponse],
)
async def list_mine_(
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    return await list_my_watched_tasks(supabase, user_id=user_id)
