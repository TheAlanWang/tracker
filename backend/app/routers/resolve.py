"""Resolve an issue identifier across all the user's workspaces."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from supabase import Client

from app.core.deps import get_current_user_id, get_supabase_admin

router = APIRouter(tags=["resolve"])


class ResolveResponse(BaseModel):
    workspace_slug: str
    project_key: str
    task_id: str
    identifier: str


@router.get("/resolve/identifier/{identifier}", response_model=ResolveResponse)
def resolve_identifier(
    identifier: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
) -> ResolveResponse:
    # Find all workspaces the user is a member of
    member_rows = (
        supabase.table("workspace_members")
        .select("workspace_id")
        .eq("user_id", user_id)
        .execute()
        .data
    )
    if not member_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    ws_ids = [r["workspace_id"] for r in member_rows]

    # Find the task by identifier within those workspaces
    task_row = (
        supabase.table("tasks")
        .select("id, identifier, workspace_id, project_id")
        .eq("identifier", identifier)
        .in_("workspace_id", ws_ids)
        .limit(1)
        .execute()
        .data
    )
    if not task_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    task = task_row[0]

    # Fetch workspace slug
    ws_row = (
        supabase.table("workspaces")
        .select("slug")
        .eq("id", task["workspace_id"])
        .single()
        .execute()
        .data
    )
    if not ws_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    # Fetch project key
    proj_row = (
        supabase.table("projects")
        .select("key")
        .eq("id", task["project_id"])
        .single()
        .execute()
        .data
    )
    if not proj_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    return ResolveResponse(
        workspace_slug=ws_row["slug"],
        project_key=proj_row["key"],
        task_id=task["id"],
        identifier=task["identifier"],
    )
