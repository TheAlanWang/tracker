"""Task watchers: subscribe / unsubscribe / list.

Watching a task means receiving notifications for its comments and status
changes. Reporter + every assignee (including reassigned ones) are
auto-subscribed via DB triggers (see 20260529000000_task_watchers.sql);
anyone in the workspace can opt in by hitting watch_task here.

list_my_watched_tasks denormalises workspace_slug / project_key onto the
response so the frontend can render rows and navigate to each task
without an extra round-trip per row.
"""

from supabase import AsyncClient

from app.schemas.watcher import WatcherResponse, WatchedTaskResponse


class WatcherError(Exception):
    pass


class TaskNotFoundError(WatcherError):
    pass


class WatcherPermissionError(WatcherError):
    pass


async def _verify_task_access(
    supabase: AsyncClient, *, user_id: str, task_id: str
) -> dict:
    """Fetch task + check the caller is a member of its workspace."""
    rows = (
        await supabase.table("tasks")
        .select("id, workspace_id")
        .eq("id", task_id)
        .execute()
    ).data
    if not rows:
        raise TaskNotFoundError(task_id)
    task = rows[0]
    member = (
        await supabase.table("workspace_members")
        .select("role")
        .eq("workspace_id", task["workspace_id"])
        .eq("user_id", user_id)
        .execute()
    ).data
    if not member:
        raise WatcherPermissionError(task_id)
    return task


async def _lookup_users(
    supabase: AsyncClient, *, user_ids: list[str]
) -> dict[str, dict[str, str | None]]:
    if not user_ids:
        return {}
    result: dict[str, dict[str, str | None]] = {}
    try:
        users = await supabase.auth.admin.list_users()
        for u in users:
            if u.id in user_ids:
                meta = u.user_metadata or {}
                result[u.id] = {
                    "email": u.email,
                    "display_name": meta.get("display_name"),
                }
    except Exception:
        pass
    return result


async def watch_task(
    supabase: AsyncClient, *, user_id: str, task_id: str
) -> WatcherResponse:
    await _verify_task_access(supabase, user_id=user_id, task_id=task_id)
    # Upsert-by-conflict: re-watching is a no-op.
    await supabase.table("task_watchers").upsert(
        {"task_id": task_id, "user_id": user_id},
        on_conflict="task_id,user_id",
    ).execute()
    rows = (
        await supabase.table("task_watchers")
        .select("*")
        .eq("task_id", task_id)
        .eq("user_id", user_id)
        .execute()
    ).data
    row = rows[0]
    profile = await _lookup_users(supabase, user_ids=[user_id]).get(user_id, {})
    return WatcherResponse(
        **row,
        email=profile.get("email"),
        display_name=profile.get("display_name"),
    )


async def unwatch_task(supabase: AsyncClient, *, user_id: str, task_id: str) -> None:
    await _verify_task_access(supabase, user_id=user_id, task_id=task_id)
    await supabase.table("task_watchers").delete().eq("task_id", task_id).eq(
        "user_id", user_id
    ).execute()


async def list_task_watchers(
    supabase: AsyncClient, *, user_id: str, task_id: str
) -> list[WatcherResponse]:
    await _verify_task_access(supabase, user_id=user_id, task_id=task_id)
    rows = (
        await supabase.table("task_watchers")
        .select("*")
        .eq("task_id", task_id)
        .order("created_at")
        .execute()
    ).data
    if not rows:
        return []
    user_ids = list({r["user_id"] for r in rows})
    profiles = await _lookup_users(supabase, user_ids=user_ids)
    return [
        WatcherResponse(
            **r,
            email=profiles.get(r["user_id"], {}).get("email"),
            display_name=profiles.get(r["user_id"], {}).get("display_name"),
        )
        for r in rows
    ]


async def list_my_watched_tasks(
    supabase: AsyncClient, *, user_id: str
) -> list[WatchedTaskResponse]:
    """All tasks the caller is watching, enriched with project + workspace
    routing fields so the frontend can render and link them."""
    watch_rows = (
        await supabase.table("task_watchers")
        .select("task_id, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    ).data
    if not watch_rows:
        return []

    task_ids = [r["task_id"] for r in watch_rows]
    watching_since: dict[str, str] = {
        r["task_id"]: r["created_at"] for r in watch_rows
    }

    task_rows = (
        await supabase.table("tasks")
        .select(
            "id, identifier, title, status, priority, workspace_id, "
            "project_id, assignee_id, reporter_id, due_date, "
            "created_at, updated_at"
        )
        .in_("id", task_ids)
        .execute()
    ).data
    if not task_rows:
        return []

    ws_ids = list({t["workspace_id"] for t in task_rows})
    proj_ids = list({t["project_id"] for t in task_rows})
    ws_rows = (
        await supabase.table("workspaces")
        .select("id, slug")
        .in_("id", ws_ids)
        .execute()
    ).data
    proj_rows = (
        await supabase.table("projects")
        .select("id, key, name")
        .in_("id", proj_ids)
        .execute()
    ).data
    ws_slug = {r["id"]: r["slug"] for r in ws_rows}
    proj_meta = {r["id"]: r for r in proj_rows}

    out: list[WatchedTaskResponse] = []
    for t in task_rows:
        p = proj_meta.get(t["project_id"], {})
        out.append(
            WatchedTaskResponse(
                id=t["id"],
                identifier=t["identifier"],
                title=t["title"],
                status=t["status"],
                priority=t["priority"],
                workspace_id=t["workspace_id"],
                workspace_slug=ws_slug.get(t["workspace_id"], ""),
                project_id=t["project_id"],
                project_key=p.get("key", ""),
                project_name=p.get("name", ""),
                assignee_id=t.get("assignee_id"),
                reporter_id=t.get("reporter_id"),
                due_date=t.get("due_date"),
                created_at=t["created_at"],
                updated_at=t["updated_at"],
                watching_since=watching_since[t["id"]],
            )
        )

    # Stable order: newest "watching_since" first
    out.sort(key=lambda r: r.watching_since, reverse=True)
    return out
