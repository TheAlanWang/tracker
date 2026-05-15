from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.core.deps import get_current_user_id, get_supabase_admin
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate
from app.services.projects import (
    ProjectKeyExistsError,
    ProjectNotFoundError,
    ProjectPermissionError,
    create_project,
    delete_project,
    get_project,
    list_projects,
    update_project,
)

router = APIRouter(tags=["projects"])


@router.get(
    "/workspaces/{ws_id}/projects", response_model=list[ProjectResponse]
)
def list_(
    ws_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return list_projects(supabase, user_id=user_id, workspace_id=ws_id)
    except ProjectPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc


@router.post(
    "/workspaces/{ws_id}/projects",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
def create(
    ws_id: str,
    payload: ProjectCreate,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return create_project(
            supabase, user_id=user_id, workspace_id=ws_id, payload=payload
        )
    except ProjectPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except ProjectKeyExistsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Project key '{exc}' already in use in this workspace",
        ) from exc


@router.get("/projects/{p_id}", response_model=ProjectResponse)
def get(
    p_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return get_project(supabase, user_id=user_id, project_id=p_id)
    except ProjectPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.patch("/projects/{p_id}", response_model=ProjectResponse)
def update(
    p_id: str,
    payload: ProjectUpdate,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return update_project(supabase, user_id=user_id, project_id=p_id, payload=payload)
    except ProjectPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.delete("/projects/{p_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(
    p_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        delete_project(supabase, user_id=user_id, project_id=p_id)
    except ProjectPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
