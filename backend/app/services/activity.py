"""Activity log business logic. Reads from activity_log (written by DB triggers)."""

from supabase import Client

from app.schemas.activity import ActivityResponse


class ActivityError(Exception):
    pass


class TaskNotFoundError(ActivityError):
    pass


class ActivityPermissionError(ActivityError):
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


def _fetch_task(supabase: Client, task_id: str) -> dict | None:
    return (
        supabase.table("tasks")
        .select("*")
        .eq("id", task_id)
        .single()
        .execute()
        .data
    )


def list_task_activity(
    supabase: Client,
    *,
    user_id: str,
    task_id: str,
) -> list[ActivityResponse]:
    task = _fetch_task(supabase, task_id)
    if not task:
        raise TaskNotFoundError(task_id)
    if not _is_member(supabase, user_id=user_id, workspace_id=task["workspace_id"]):
        raise ActivityPermissionError(task_id)
    rows = (
        supabase.table("activity_log")
        .select("*")
        .eq("task_id", task_id)
        .order("created_at", desc=True)
        .limit(200)
        .execute()
        .data
    )
    return [ActivityResponse(**r) for r in rows]
