"""Task business logic.

Service functions take an admin Supabase client and the acting user_id.
Membership against the project's workspace is verified explicitly before
any write. RLS is defense-in-depth.
"""

from fastapi import BackgroundTasks
from supabase import AsyncClient

from app.schemas.task import (
    TaskCreate,
    TaskResponse,
    TaskUpdate,
)
from app.services.emails import send_assignment_email, should_email_assignment


class TaskError(Exception):
    pass


class TaskNotFoundError(TaskError):
    pass


class TaskPermissionError(TaskError):
    pass


class ProjectNotFoundError(TaskError):
    pass


async def _is_member(supabase: AsyncClient, *, user_id: str, workspace_id: str) -> bool:
    rows = (
        await supabase.table("workspace_members")
        .select("role")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .execute()
    ).data
    return bool(rows)


async def _fetch_project(supabase: AsyncClient, project_id: str) -> dict | None:
    return (
        await supabase.table("projects")
        .select("*")
        .eq("id", project_id)
        .single()
        .execute()
    ).data


async def _fetch_workspace_slug(supabase: AsyncClient, workspace_id: str) -> str:
    row = (
        await supabase.table("workspaces")
        .select("slug")
        .eq("id", workspace_id)
        .single()
        .execute()
    ).data
    return (row or {}).get("slug") or ""


async def _maybe_email_assignment(
    supabase: AsyncClient,
    *,
    task: TaskResponse,
    project: dict,
    actor_id: str,
    recipient_id: str,
    background_tasks: BackgroundTasks | None,
) -> None:
    """Schedule an assignment email if conditions allow.

    The fire-or-skip decision was already made by `should_email_assignment`;
    this resolves the workspace slug for the deep link and schedules the
    background send. The threshold is passed through so a flip to 'off'
    between scheduling and execution still aborts the send.
    """
    if not background_tasks:
        return
    threshold = project.get("notify_assignee_threshold") or "off"
    ws_slug = await _fetch_workspace_slug(supabase, project["workspace_id"])
    background_tasks.add_task(
        send_assignment_email,
        supabase,
        task=task,
        project_name=project.get("name", ""),
        project_key=project.get("key", ""),
        workspace_slug=ws_slug,
        threshold=threshold,
        assignee_id=recipient_id,
        actor_id=actor_id,
    )


async def create_task(
    supabase: AsyncClient,
    *,
    user_id: str,
    project_id: str,
    payload: TaskCreate,
    background_tasks: BackgroundTasks | None = None,
) -> TaskResponse:
    project = await _fetch_project(supabase, project_id)
    if not project:
        raise ProjectNotFoundError(project_id)
    if not await _is_member(
        supabase, user_id=user_id, workspace_id=project["workspace_id"]
    ):
        raise TaskPermissionError(project_id)

    result = await supabase.rpc(
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
    task = TaskResponse(**result.data)

    # Email the assignee if this is a brand-new task assigned to someone
    # other than the creator and the project's threshold accepts the
    # task's priority. should_email_assignment treats both old_* args as
    # None to flag the create path.
    threshold = project.get("notify_assignee_threshold") or "off"
    recipient = should_email_assignment(
        old_priority=None,
        old_assignee=None,
        new_priority=task.priority,
        new_assignee=task.assignee_id,
        new_status=task.status,
        actor_id=user_id,
        threshold=threshold,
    )
    if recipient:
        await _maybe_email_assignment(
            supabase,
            task=task,
            project=project,
            actor_id=user_id,
            recipient_id=recipient,
            background_tasks=background_tasks,
        )
        # Surface the recipient to the frontend so the create-task mutation
        # can toast "Emailed X about FRO-N" without needing to re-run the
        # email decision client-side.
        task = task.model_copy(update={"email_notified_assignee_id": recipient})

    return task


async def list_tasks(
    supabase: AsyncClient,
    *,
    user_id: str,
    project_id: str,
    status: str | None = None,
    sprint: str | None = None,
) -> list[TaskResponse]:
    project = await _fetch_project(supabase, project_id)
    if not project:
        raise ProjectNotFoundError(project_id)
    if not await _is_member(
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
    rows = (await query.order("created_at", desc=True).limit(200).execute()).data
    return [TaskResponse(**r) for r in rows]


async def get_task(
    supabase: AsyncClient, *, user_id: str, task_id: str
) -> TaskResponse:
    row = (
        await supabase.table("tasks")
        .select("*")
        .eq("id", task_id)
        .single()
        .execute()
    ).data
    if not row:
        raise TaskNotFoundError(task_id)
    if not await _is_member(
        supabase, user_id=user_id, workspace_id=row["workspace_id"]
    ):
        raise TaskPermissionError(task_id)
    return TaskResponse(**row)


async def update_task(
    supabase: AsyncClient,
    *,
    user_id: str,
    task_id: str,
    payload: TaskUpdate,
    background_tasks: BackgroundTasks | None = None,
) -> TaskResponse:
    # Membership check via get_task; activity log is written by the
    # log_task_change DB trigger (auth.uid() = user_id via injected JWT).
    # The fetched row also doubles as our snapshot of OLD state for the
    # urgent-email delta check below.
    old = await get_task(supabase, user_id=user_id, task_id=task_id)

    updates = payload.model_dump(exclude_unset=True)
    if "due_date" in updates and updates["due_date"] is not None:
        updates["due_date"] = updates["due_date"].isoformat()
    if not updates:
        return await get_task(supabase, user_id=user_id, task_id=task_id)

    updated = (
        await supabase.table("tasks")
        .update(updates)
        .eq("id", task_id)
        .execute()
    ).data[0]
    new_task = TaskResponse(**updated)

    # Assignment-email delta. Short-circuit on the common case where
    # neither priority nor assignee changed — most updates are status /
    # title / description edits where no email can possibly fire, so
    # skip the projects round-trip entirely.
    if (
        old.priority != new_task.priority
        or old.assignee_id != new_task.assignee_id
    ):
        project = await _fetch_project(supabase, new_task.project_id)
        threshold = (project or {}).get("notify_assignee_threshold") or "off"
        recipient = should_email_assignment(
            old_priority=old.priority,
            old_assignee=old.assignee_id,
            new_priority=new_task.priority,
            new_assignee=new_task.assignee_id,
            new_status=new_task.status,
            actor_id=user_id,
            threshold=threshold,
        )
        if recipient and project:
            await _maybe_email_assignment(
                supabase,
                task=new_task,
                project=project,
                actor_id=user_id,
                recipient_id=recipient,
                background_tasks=background_tasks,
            )
            new_task = new_task.model_copy(
                update={"email_notified_assignee_id": recipient}
            )

    return new_task


async def delete_task(
    supabase: AsyncClient, *, user_id: str, task_id: str
) -> None:
    # Reuse get_task's not-found + membership checks
    await get_task(supabase, user_id=user_id, task_id=task_id)
    await supabase.table("tasks").delete().eq("id", task_id).execute()
async def list_workspace_tasks(
    supabase: AsyncClient,
    *,
    user_id: str,
    workspace_id: str,
    assignee_id: str | None = None,
) -> list[TaskResponse]:
    if not await _is_member(supabase, user_id=user_id, workspace_id=workspace_id):
        raise TaskPermissionError(workspace_id)

    query = (
        supabase.table("tasks")
        .select("*")
        .eq("workspace_id", workspace_id)
    )
    if assignee_id:
        query = query.eq("assignee_id", assignee_id)

    rows = (await query.order("updated_at", desc=True).limit(200).execute()).data
    return [TaskResponse(**r) for r in rows]


async def move_task(
    supabase: AsyncClient,
    *,
    user_id: str,
    task_id: str,
    status: str,
    position: float,
) -> TaskResponse:
    row = (
        await supabase.table("tasks")
        .select("*")
        .eq("id", task_id)
        .single()
        .execute()
    ).data
    if not row:
        raise TaskNotFoundError(task_id)
    if not await _is_member(supabase, user_id=user_id, workspace_id=row["workspace_id"]):
        raise TaskPermissionError(task_id)
    updated = (
        await supabase.table("tasks")
        .update({"status": status, "position": position})
        .eq("id", task_id)
        .execute()
    ).data[0]
    return TaskResponse(**updated)
