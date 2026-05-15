from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.core.deps import get_current_user_id, get_supabase_admin
from app.schemas.sprint import SprintCreate, SprintResponse, SprintUpdate
from app.services.sprints import (
    AnotherActiveSprintError,
    ProjectNotFoundError,
    SprintInvalidTransitionError,
    SprintNotFoundError,
    SprintPermissionError,
    complete_sprint,
    create_sprint,
    delete_sprint,
    get_sprint,
    list_sprints,
    start_sprint,
    update_sprint,
)

router = APIRouter(tags=["sprints"])


@router.get(
    "/projects/{p_id}/sprints", response_model=list[SprintResponse]
)
def list_(
    p_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return list_sprints(supabase, user_id=user_id, project_id=p_id)
    except SprintPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.post(
    "/projects/{p_id}/sprints",
    response_model=SprintResponse,
    status_code=status.HTTP_201_CREATED,
)
def create(
    p_id: str,
    payload: SprintCreate,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return create_sprint(supabase, user_id=user_id, project_id=p_id, payload=payload)
    except SprintPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.get("/sprints/{s_id}", response_model=SprintResponse)
def get(
    s_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return get_sprint(supabase, user_id=user_id, sprint_id=s_id)
    except SprintPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except SprintNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.patch("/sprints/{s_id}", response_model=SprintResponse)
def update(
    s_id: str,
    payload: SprintUpdate,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return update_sprint(
            supabase, user_id=user_id, sprint_id=s_id, payload=payload
        )
    except SprintPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except SprintNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.delete("/sprints/{s_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(
    s_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        delete_sprint(supabase, user_id=user_id, sprint_id=s_id)
    except SprintPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except SprintNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.post("/sprints/{s_id}/start", response_model=SprintResponse)
def start(
    s_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return start_sprint(supabase, user_id=user_id, sprint_id=s_id)
    except SprintPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except SprintNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
    except SprintInvalidTransitionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Sprint is not in 'planned' status",
        ) from exc
    except AnotherActiveSprintError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Another active sprint already exists in this project",
        ) from exc


@router.post("/sprints/{s_id}/complete")
def complete(
    s_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
) -> dict:
    try:
        return complete_sprint(supabase, user_id=user_id, sprint_id=s_id)
    except SprintPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except SprintNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
    except SprintInvalidTransitionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Sprint is not in 'active' status",
        ) from exc
