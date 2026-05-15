"""Issue business logic.

Service functions take an admin Supabase client and the acting user_id.
Membership against the project's workspace is verified explicitly before
any write. RLS is defense-in-depth.
"""

from supabase import Client

from app.schemas.issue import (
    IssueCreate,
    IssueResponse,
    IssueUpdate,
)


class IssueError(Exception):
    pass


class IssueNotFoundError(IssueError):
    pass


class IssuePermissionError(IssueError):
    pass


class ProjectNotFoundError(IssueError):
    pass


def _is_member(supabase: Client, *, user_id: str, workspace_id: str) -> bool:
    rows = (
        supabase.table("workspace_members")
        .select("role")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .execute()
        .data
    )
    return bool(rows)


def _fetch_project(supabase: Client, project_id: str) -> dict | None:
    return (
        supabase.table("projects")
        .select("*")
        .eq("id", project_id)
        .single()
        .execute()
        .data
    )


def create_issue(
    supabase: Client,
    *,
    user_id: str,
    project_id: str,
    payload: IssueCreate,
) -> IssueResponse:
    project = _fetch_project(supabase, project_id)
    if not project:
        raise ProjectNotFoundError(project_id)
    if not _is_member(
        supabase, user_id=user_id, workspace_id=project["workspace_id"]
    ):
        raise IssuePermissionError(project_id)

    result = supabase.rpc(
        "create_issue_with_identifier",
        {
            "p_workspace_id": project["workspace_id"],
            "p_project_id": project_id,
            "p_title": payload.title,
            "p_description": payload.description,
            "p_priority": payload.priority,
            "p_status": payload.status,
            "p_assignee_id": payload.assignee_id,
            "p_due_date": payload.due_date.isoformat() if payload.due_date else None,
            "p_reporter_id": user_id,
        },
    ).execute()

    return IssueResponse(**result.data)


def list_issues(
    supabase: Client,
    *,
    user_id: str,
    project_id: str,
    status: str | None = None,
    sprint: str | None = None,
) -> list[IssueResponse]:
    project = _fetch_project(supabase, project_id)
    if not project:
        raise ProjectNotFoundError(project_id)
    if not _is_member(
        supabase, user_id=user_id, workspace_id=project["workspace_id"]
    ):
        raise IssuePermissionError(project_id)

    query = (
        supabase.table("issues")
        .select("*")
        .eq("project_id", project_id)
    )
    if status:
        query = query.eq("status", status)
    if sprint == "null":
        query = query.is_("sprint_id", "null")
    elif sprint:
        query = query.eq("sprint_id", sprint)
    rows = query.order("created_at", desc=True).limit(200).execute().data
    return [IssueResponse(**r) for r in rows]


def get_issue(
    supabase: Client, *, user_id: str, issue_id: str
) -> IssueResponse:
    row = (
        supabase.table("issues")
        .select("*")
        .eq("id", issue_id)
        .single()
        .execute()
        .data
    )
    if not row:
        raise IssueNotFoundError(issue_id)
    if not _is_member(
        supabase, user_id=user_id, workspace_id=row["workspace_id"]
    ):
        raise IssuePermissionError(issue_id)
    return IssueResponse(**row)


def update_issue(
    supabase: Client,
    *,
    user_id: str,
    issue_id: str,
    payload: IssueUpdate,
) -> IssueResponse:
    current = get_issue(supabase, user_id=user_id, issue_id=issue_id)

    updates = payload.model_dump(exclude_unset=True)
    # Serialize date to ISO string for Postgres
    if "due_date" in updates and updates["due_date"] is not None:
        updates["due_date"] = updates["due_date"].isoformat()
    if not updates:
        return current

    updated = (
        supabase.table("issues")
        .update(updates)
        .eq("id", issue_id)
        .execute()
        .data[0]
    )
    return IssueResponse(**updated)


def delete_issue(
    supabase: Client, *, user_id: str, issue_id: str
) -> None:
    # Reuse get_issue's not-found + membership checks
    get_issue(supabase, user_id=user_id, issue_id=issue_id)
    supabase.table("issues").delete().eq("id", issue_id).execute()


def list_workspace_issues(
    supabase: Client,
    *,
    user_id: str,
    workspace_id: str,
    assignee_id: str | None = None,
) -> list[IssueResponse]:
    if not _is_member(supabase, user_id=user_id, workspace_id=workspace_id):
        raise IssuePermissionError(workspace_id)

    query = (
        supabase.table("issues")
        .select("*")
        .eq("workspace_id", workspace_id)
    )
    if assignee_id:
        query = query.eq("assignee_id", assignee_id)

    rows = query.order("updated_at", desc=True).limit(200).execute().data
    return [IssueResponse(**r) for r in rows]


def move_issue(
    supabase: Client,
    *,
    user_id: str,
    issue_id: str,
    status: str,
    position: float,
) -> IssueResponse:
    row = (
        supabase.table("issues")
        .select("*")
        .eq("id", issue_id)
        .single()
        .execute()
        .data
    )
    if not row:
        raise IssueNotFoundError(issue_id)
    if not _is_member(supabase, user_id=user_id, workspace_id=row["workspace_id"]):
        raise IssuePermissionError(issue_id)
    updated = (
        supabase.table("issues")
        .update({"status": status, "position": position})
        .eq("id", issue_id)
        .execute()
        .data[0]
    )
    return IssueResponse(**updated)
