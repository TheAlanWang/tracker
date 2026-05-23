from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from supabase import AsyncClient

from app.core.deps import get_current_user_id, get_supabase_admin
from app.schemas.task import (
    TaskCreate,
    TaskMove,
    TaskResponse,
    TaskStatus,
    TaskUpdate,
)
from app.services.tasks import (
    TaskNotFoundError,
    TaskPermissionError,
    ProjectNotFoundError,
    create_task,
    delete_task,
    get_task,
    list_tasks,
    list_workspace_tasks,
    move_task,
    update_task,
)

router = APIRouter(tags=["tasks"])


@router.get(
    "/workspaces/{ws_id}/tasks", response_model=list[TaskResponse]
)
async def list_workspace(
    ws_id: str,
    assignee_id: str | None = Query(None),
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        return await list_workspace_tasks(
            supabase,
            user_id=user_id,
            workspace_id=ws_id,
            assignee_id=assignee_id,
        )
    except TaskPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc


@router.get(
    "/projects/{p_id}/tasks", response_model=list[TaskResponse]
)
async def list_(
    p_id: str,
    # Aliased so the URL param is `?status=` but the local name is `status_filter`,
    # avoiding the shadow with the FastAPI `status` module.
    status_filter: TaskStatus | None = Query(None, alias="status"),
    sprint: str | None = Query(None),
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        return await list_tasks(
            supabase, user_id=user_id, project_id=p_id,
            status=status_filter, sprint=sprint,
        )
    except TaskPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.post(
    "/projects/{p_id}/tasks",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create(
    p_id: str,
    payload: TaskCreate,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        return await create_task(
            supabase,
            user_id=user_id,
            project_id=p_id,
            payload=payload,
            background_tasks=background_tasks,
        )
    except TaskPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.get("/tasks/{t_id}", response_model=TaskResponse)
async def get(
    t_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        return await get_task(supabase, user_id=user_id, task_id=t_id)
    except TaskPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except TaskNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.patch("/tasks/{t_id}", response_model=TaskResponse)
async def update(
    t_id: str,
    payload: TaskUpdate,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        return await update_task(
            supabase,
            user_id=user_id,
            task_id=t_id,
            payload=payload,
            background_tasks=background_tasks,
        )
    except TaskPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except TaskNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.delete("/tasks/{t_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(
    t_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        await delete_task(supabase, user_id=user_id, task_id=t_id)
    except TaskPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except TaskNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.post("/tasks/{t_id}/move", response_model=TaskResponse)
async def move(
    t_id: str,
    payload: TaskMove,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        return await move_task(
            supabase,
            user_id=user_id,
            task_id=t_id,
            status=payload.status,
            position=payload.position,
        )
    except TaskPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except TaskNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
