from fastapi import APIRouter, Depends, HTTPException, Query, status
from supabase import AsyncClient

from app.core.deps import get_current_user_id, get_supabase_admin
from app.schemas.goal import GoalCreate, GoalResponse, GoalUpdate
from app.schemas.task import TaskResponse
from app.services.goals import (
    GoalError,
    GoalNotFoundError,
    GoalPermissionError,
    create_goal,
    delete_goal,
    get_goal,
    list_goal_tasks,
    list_goals,
    update_goal,
)

router = APIRouter(tags=["goals"])


@router.get(
    "/workspaces/{ws_id}/goals",
    response_model=list[GoalResponse],
)
async def list_(
    ws_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        return await list_goals(supabase, user_id=user_id, workspace_id=ws_id)
    except GoalPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc


@router.post(
    "/workspaces/{ws_id}/goals",
    response_model=GoalResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create(
    ws_id: str,
    payload: GoalCreate,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        return await create_goal(
            supabase, user_id=user_id, workspace_id=ws_id, payload=payload
        )
    except GoalPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except GoalNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="parent_goal_id refers to a goal in a different workspace",
        ) from exc


@router.get("/goals/{g_id}", response_model=GoalResponse)
async def get(
    g_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        return await get_goal(supabase, user_id=user_id, goal_id=g_id)
    except GoalPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except GoalNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.patch("/goals/{g_id}", response_model=GoalResponse)
async def update(
    g_id: str,
    payload: GoalUpdate,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        return await update_goal(
            supabase, user_id=user_id, goal_id=g_id, payload=payload
        )
    except GoalPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except GoalNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
    except GoalError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@router.delete("/goals/{g_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(
    g_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        await delete_goal(supabase, user_id=user_id, goal_id=g_id)
    except GoalPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except GoalNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.get(
    "/goals/{g_id}/tasks",
    response_model=list[TaskResponse],
)
async def list_tasks(
    g_id: str,
    recursive: bool = Query(False),
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        rows = await list_goal_tasks(
            supabase, user_id=user_id, goal_id=g_id, recursive=recursive
        )
        return [TaskResponse(**r) for r in rows]
    except GoalPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except GoalNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
