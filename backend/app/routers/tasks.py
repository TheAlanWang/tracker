from fastapi import APIRouter, Depends, HTTPException, Query, status
from supabase import Client

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
def list_workspace(
    ws_id: str,
    assignee_id: str | None = Query(None),
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return list_workspace_tasks(
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
def list_(
    p_id: str,
    # Aliased so the URL param is `?status=` but the local name is `status_filter`,
    # avoiding the shadow with the FastAPI `status` module.
    status_filter: TaskStatus | None = Query(None, alias="status"),
    sprint: str | None = Query(None),
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return list_tasks(
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
def create(
    p_id: str,
    payload: TaskCreate,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return create_task(
            supabase, user_id=user_id, project_id=p_id, payload=payload
        )
    except TaskPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.get("/tasks/{t_id}", response_model=TaskResponse)
def get(
    t_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return get_task(supabase, user_id=user_id, task_id=t_id)
    except TaskPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except TaskNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.patch("/tasks/{t_id}", response_model=TaskResponse)
def update(
    t_id: str,
    payload: TaskUpdate,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return update_task(
            supabase, user_id=user_id, task_id=t_id, payload=payload
        )
    except TaskPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except TaskNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.delete("/tasks/{t_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(
    t_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        delete_task(supabase, user_id=user_id, task_id=t_id)
    except TaskPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except TaskNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.post("/tasks/{t_id}/move", response_model=TaskResponse)
def move(
    t_id: str,
    payload: TaskMove,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return move_task(
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
