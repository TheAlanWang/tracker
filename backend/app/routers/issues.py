from fastapi import APIRouter, Depends, HTTPException, Query, status
from supabase import Client

from app.core.deps import get_current_user_id, get_supabase_admin
from app.schemas.issue import (
    IssueCreate,
    IssueMove,
    IssueResponse,
    IssueStatus,
    IssueUpdate,
)
from app.services.issues import (
    IssueNotFoundError,
    IssuePermissionError,
    ProjectNotFoundError,
    create_issue,
    delete_issue,
    get_issue,
    list_issues,
    move_issue,
    update_issue,
)

router = APIRouter(tags=["issues"])


@router.get(
    "/projects/{p_id}/issues", response_model=list[IssueResponse]
)
def list_(
    p_id: str,
    # Aliased so the URL param is `?status=` but the local name is `status_filter`,
    # avoiding the shadow with the FastAPI `status` module.
    status_filter: IssueStatus | None = Query(None, alias="status"),
    sprint: str | None = Query(None),
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return list_issues(
            supabase, user_id=user_id, project_id=p_id,
            status=status_filter, sprint=sprint,
        )
    except IssuePermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.post(
    "/projects/{p_id}/issues",
    response_model=IssueResponse,
    status_code=status.HTTP_201_CREATED,
)
def create(
    p_id: str,
    payload: IssueCreate,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return create_issue(
            supabase, user_id=user_id, project_id=p_id, payload=payload
        )
    except IssuePermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.get("/issues/{i_id}", response_model=IssueResponse)
def get(
    i_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return get_issue(supabase, user_id=user_id, issue_id=i_id)
    except IssuePermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except IssueNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.patch("/issues/{i_id}", response_model=IssueResponse)
def update(
    i_id: str,
    payload: IssueUpdate,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return update_issue(
            supabase, user_id=user_id, issue_id=i_id, payload=payload
        )
    except IssuePermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except IssueNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.delete("/issues/{i_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(
    i_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        delete_issue(supabase, user_id=user_id, issue_id=i_id)
    except IssuePermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except IssueNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.post("/issues/{i_id}/move", response_model=IssueResponse)
def move(
    i_id: str,
    payload: IssueMove,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return move_issue(
            supabase,
            user_id=user_id,
            issue_id=i_id,
            status=payload.status,
            position=payload.position,
        )
    except IssuePermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except IssueNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
