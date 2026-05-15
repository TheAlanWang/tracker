"""Task business logic.

Service functions take an admin Supabase client and the acting user_id.
Membership against the project's workspace is verified explicitly before
any write. RLS is defense-in-depth.
"""

from supabase import Client

from app.schemas.task import (
    TaskCreate,
    TaskResponse,
    TaskUpdate,
)


class TaskError(Exception):
    pass


class TaskNotFoundError(TaskError):
    pass


class TaskPermissionError(TaskError):
    pass


class ProjectNotFoundError(TaskError):
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


def create_task(
    supabase: Client,
    *,
    user_id: str,
    project_id: str,
    payload: TaskCreate,
) -> TaskResponse:
    project = _fetch_project(supabase, project_id)
    if not project:
        raise ProjectNotFoundError(project_id)
    if not _is_member(
        supabase, user_id=user_id, workspace_id=project["workspace_id"]
    ):
        raise TaskPermissionError(project_id)

    result = supabase.rpc(
        "create_task_with_identifier",
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

    return TaskResponse(**result.data)


def list_tasks(
    supabase: Client,
    *,
    user_id: str,
    project_id: str,
    status: str | None = None,
    sprint: str | None = None,
) -> list[TaskResponse]:
    project = _fetch_project(supabase, project_id)
    if not project:
        raise ProjectNotFoundError(project_id)
    if not _is_member(
        supabase, user_id=user_id, workspace_id=project["workspace_id"]
    ):
        raise TaskPermissionError(project_id)

    query = (
        supabase.table("tasks")
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
    return [TaskResponse(**r) for r in rows]


def get_task(
    supabase: Client, *, user_id: str, task_id: str
) -> TaskResponse:
    row = (
        supabase.table("tasks")
        .select("*")
        .eq("id", task_id)
        .single()
        .execute()
        .data
    )
    if not row:
        raise TaskNotFoundError(task_id)
    if not _is_member(
        supabase, user_id=user_id, workspace_id=row["workspace_id"]
    ):
        raise TaskPermissionError(task_id)
    return TaskResponse(**row)


def update_task(
    supabase: Client,
    *,
    user_id: str,
    task_id: str,
    payload: TaskUpdate,
) -> TaskResponse:
    current = get_task(supabase, user_id=user_id, task_id=task_id)

    updates = payload.model_dump(exclude_unset=True)
    # Serialize date to ISO string for Postgres
    if "due_date" in updates and updates["due_date"] is not None:
        updates["due_date"] = updates["due_date"].isoformat()
    if not updates:
        return current

    updated = (
        supabase.table("tasks")
        .update(updates)
        .eq("id", task_id)
        .execute()
        .data[0]
    )
    return TaskResponse(**updated)


def delete_task(
    supabase: Client, *, user_id: str, task_id: str
) -> None:
    # Reuse get_task's not-found + membership checks
    get_task(supabase, user_id=user_id, task_id=task_id)
    supabase.table("tasks").delete().eq("id", task_id).execute()


def list_workspace_tasks(
    supabase: Client,
    *,
    user_id: str,
    workspace_id: str,
    assignee_id: str | None = None,
) -> list[TaskResponse]:
    if not _is_member(supabase, user_id=user_id, workspace_id=workspace_id):
        raise TaskPermissionError(workspace_id)

    query = (
        supabase.table("tasks")
        .select("*")
        .eq("workspace_id", workspace_id)
    )
    if assignee_id:
        query = query.eq("assignee_id", assignee_id)

    rows = query.order("updated_at", desc=True).limit(200).execute().data
    return [TaskResponse(**r) for r in rows]


def move_task(
    supabase: Client,
    *,
    user_id: str,
    task_id: str,
    status: str,
    position: float,
) -> TaskResponse:
    row = (
        supabase.table("tasks")
        .select("*")
        .eq("id", task_id)
        .single()
        .execute()
        .data
    )
    if not row:
        raise TaskNotFoundError(task_id)
    if not _is_member(supabase, user_id=user_id, workspace_id=row["workspace_id"]):
        raise TaskPermissionError(task_id)
    updated = (
        supabase.table("tasks")
        .update({"status": status, "position": position})
        .eq("id", task_id)
        .execute()
        .data[0]
    )
    return TaskResponse(**updated)
