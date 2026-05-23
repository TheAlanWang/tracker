"""Activity log business logic. Reads from activity_log (written by DB triggers)."""

from datetime import datetime

from supabase import AsyncClient

from app.schemas.activity import ActivityResponse, MyActivityResponse


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


async def list_my_activity(
    supabase: AsyncClient,
    *,
    user_id: str,
    since: datetime | None = None,
    limit: int = 50,
) -> list[MyActivityResponse]:
    """Recent activity authored by the current user, enriched with the
    task's human identifier (e.g. 'TRAC-23').

    Filter by `actor_id = user_id` server-side so users only see their
    own action history. Optional `since` (ISO datetime) bounds the
    window for "what did I do yesterday / this week" queries. Default
    limit 50, max 200. Note: rows for tasks that have since been deleted
    will have `task_identifier = null` (activity_log has CASCADE delete,
    but if a delete is in-flight or a stale row exists, this is the
    safe fallback)."""
    query = (
        supabase.table("activity_log")
        .select("*")
        .eq("actor_id", user_id)
        .order("created_at", desc=True)
        .limit(min(max(limit, 1), 200))
    )
    if since is not None:
        query = query.gte("created_at", since.isoformat())
    rows = (await query.execute()).data
    if not rows:
        return []

    # Batch fetch task identifiers — one query for all referenced task_ids
    # rather than N queries (one per row). AI demos can pull 50 rows; an
    # N+1 pattern would explode latency on the standup endpoint.
    task_ids = list({r["task_id"] for r in rows})
    tasks = (
        await supabase.table("tasks")
        .select("id, identifier")
        .in_("id", task_ids)
        .execute()
    ).data
    id_to_identifier = {t["id"]: t["identifier"] for t in tasks}

    return [
        MyActivityResponse(
            **r,
            task_identifier=id_to_identifier.get(r["task_id"]),
        )
        for r in rows
    ]
