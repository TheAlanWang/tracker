from fastapi import APIRouter, Depends, HTTPException, status
from supabase import AsyncClient

from app.core.deps import get_current_user_id, get_supabase_admin
from app.schemas.dependency import (
    DependencyCreate,
    DependencyResponse,
    TaskDependencies,
)
from app.services.dependencies import (
    CrossWorkspaceError,
    CycleError,
    DependencyError,
    DependencyNotFoundError,
    DependencyPermissionError,
    DuplicateError,
    TaskNotFoundError,
    create_dependency,
    delete_dependency,
    list_blocked_task_ids,
    list_dependencies,
)

router = APIRouter(tags=["dependencies"])


@router.get(
    "/tasks/{t_id}/dependencies",
    response_model=TaskDependencies,
)
async def list_(
    t_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        return await list_dependencies(supabase, user_id=user_id, task_id=t_id)
    except DependencyPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except TaskNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.post(
    "/dependencies",
    response_model=DependencyResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create(
    payload: DependencyCreate,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        return await create_dependency(
            supabase,
            user_id=user_id,
            blocker_task_id=payload.blocker_task_id,
            blocked_task_id=payload.blocked_task_id,
        )
    except DependencyPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except TaskNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
    except CrossWorkspaceError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    except CycleError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc
    except DuplicateError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc
    except DependencyError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@router.get("/workspaces/{ws_id}/blocked-tasks", response_model=list[str])
async def list_blocked(
    ws_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        return await list_blocked_task_ids(
            supabase, user_id=user_id, workspace_id=ws_id
        )
    except DependencyPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc


@router.delete(
    "/dependencies/{d_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete(
    d_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    try:
        await delete_dependency(supabase, user_id=user_id, dependency_id=d_id)
    except DependencyPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except DependencyNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
