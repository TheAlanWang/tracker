"""Activity log business logic. Reads from activity_log (written by DB triggers)."""

from supabase import AsyncClient

from app.schemas.activity import ActivityResponse


class ActivityError(Exception):
    pass


class TaskNotFoundError(ActivityError):
    pass


class ActivityPermissionError(ActivityError):
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


async def _fetch_task(supabase: AsyncClient, task_id: str) -> dict | None:
    return (
        await supabase.table("tasks")
        .select("*")
        .eq("id", task_id)
        .single()
        .execute()
    ).data


async def list_task_activity(
    supabase: AsyncClient,
    *,
    user_id: str,
    task_id: str,
) -> list[ActivityResponse]:
    task = await _fetch_task(supabase, task_id)
    if not task:
        raise TaskNotFoundError(task_id)
    if not await _is_member(supabase, user_id=user_id, workspace_id=task["workspace_id"]):
        raise ActivityPermissionError(task_id)
    rows = (
        await supabase.table("activity_log")
        .select("*")
        .eq("task_id", task_id)
        .order("created_at", desc=True)
        .limit(200)
        .execute()
    ).data
    return [ActivityResponse(**r) for r in rows]
