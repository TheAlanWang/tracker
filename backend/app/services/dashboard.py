"""Personal dashboard aggregation.

Bundles the data the Dashboard page needs into a single response so the
frontend doesn't fan out to 6+ endpoints on every load:
- stats (open / done this week / overdue / in review — exact counts via
  PostgREST head=true to skip row payloads)
- assigned_to_me (open tasks I own, latest 20)
- due_this_week / overdue (subsets of the above by date)
- done_this_week_tasks (the actual rows behind the throughput stat)
- active_sprints across the user's workspaces
- recent_activity (last 15 entries, enriched with actor display name +
  email via the supabase admin API)

When workspace_id is passed, results are scoped to that single workspace;
otherwise they span every workspace the caller is a member of.
"""

import asyncio
from datetime import date, datetime, timedelta, timezone

from supabase import AsyncClient

from app.schemas.dashboard import (
    DashboardActivity,
    DashboardResponse,
    DashboardSprint,
    DashboardStats,
    DashboardTask,
)


def _empty_response() -> DashboardResponse:
    return DashboardResponse(
        assigned_to_me=[],
        active_sprints=[],
        due_this_week=[],
        overdue=[],
        done_this_week_tasks=[],
        stats=DashboardStats(open=0, done_this_week=0, overdue=0, in_review=0),
        recent_activity=[],
    )


async def get_dashboard(
    supabase: AsyncClient,
    *,
    user_id: str,
    workspace_id: str | None = None,
) -> DashboardResponse:
    member_rows = (
        await supabase.table("workspace_members")
        .select("workspace_id")
        .eq("user_id", user_id)
        .execute()
    ).data
    if not member_rows:
        return _empty_response()

    member_ws_ids = {r["workspace_id"] for r in member_rows}

    if workspace_id:
        # Scope to a single workspace, but only if the user is a member
        if workspace_id not in member_ws_ids:
            return _empty_response()
        ws_ids = [workspace_id]
    else:
        ws_ids = list(member_ws_ids)

    # Stage 1: workspaces + projects — independent, fire together.
    ws_r, proj_r = await asyncio.gather(
        supabase.table("workspaces")
        .select("id, slug")
        .in_("id", ws_ids)
        .execute(),
        supabase.table("projects")
        .select("id, key, name, workspace_id")
        .in_("workspace_id", ws_ids)
        .execute(),
    )
    ws_rows = ws_r.data
    proj_rows = proj_r.data
    ws_slug_map: dict[str, str] = {r["id"]: r["slug"] for r in ws_rows}
    proj_key_map: dict[str, str] = {r["id"]: r["key"] for r in proj_rows}
    proj_name_map: dict[str, str] = {r["id"]: r["name"] for r in proj_rows}
    proj_ws_map: dict[str, str] = {r["id"]: r["workspace_id"] for r in proj_rows}
    proj_ids = list(proj_key_map.keys())

    today = date.today()
    week_end = today + timedelta(days=7)
    week_ago_dt = datetime.now(timezone.utc) - timedelta(days=7)

    # Stage 2: the rest of the fan-out. 8 unconditional queries (4 task
    # lists + 4 KPI counts) and 2 conditional on having projects (active
    # sprints + recent_tasks). asyncio.gather multiplexes them on the
    # event loop; collapsing ~15×50ms sequential roundtrips to ~1×50ms.
    assigned_co = (
        supabase.table("tasks")
        .select("id, identifier, title, status, project_id, due_date, updated_at")
        .eq("assignee_id", user_id)
        .in_("workspace_id", ws_ids)
        .not_.in_("status", ["done", "cancelled"])
        .order("updated_at", desc=True)
        .limit(20)
        .execute()
    )
    due_co = (
        supabase.table("tasks")
        .select("id, identifier, title, status, project_id, due_date, updated_at")
        .eq("assignee_id", user_id)
        .in_("workspace_id", ws_ids)
        .not_.in_("status", ["done", "cancelled"])
        .gte("due_date", today.isoformat())
        .lte("due_date", week_end.isoformat())
        .order("due_date", desc=False)
        .limit(20)
        .execute()
    )
    overdue_co = (
        supabase.table("tasks")
        .select("id, identifier, title, status, project_id, due_date, updated_at")
        .eq("assignee_id", user_id)
        .in_("workspace_id", ws_ids)
        .not_.in_("status", ["done", "cancelled"])
        .lt("due_date", today.isoformat())
        .order("due_date", desc=False)
        .limit(20)
        .execute()
    )
    done_week_co = (
        supabase.table("tasks")
        .select("id, identifier, title, status, project_id, due_date, updated_at")
        .eq("assignee_id", user_id)
        .in_("workspace_id", ws_ids)
        .eq("status", "done")
        .gte("updated_at", week_ago_dt.isoformat())
        .order("updated_at", desc=True)
        .limit(20)
        .execute()
    )
    open_count_co = (
        supabase.table("tasks")
        .select("id", count="exact", head=True)
        .eq("assignee_id", user_id)
        .in_("workspace_id", ws_ids)
        .not_.in_("status", ["done", "cancelled"])
        .execute()
    )
    done_week_count_co = (
        supabase.table("tasks")
        .select("id", count="exact", head=True)
        .eq("assignee_id", user_id)
        .in_("workspace_id", ws_ids)
        .eq("status", "done")
        .gte("updated_at", week_ago_dt.isoformat())
        .execute()
    )
    overdue_count_co = (
        supabase.table("tasks")
        .select("id", count="exact", head=True)
        .eq("assignee_id", user_id)
        .in_("workspace_id", ws_ids)
        .not_.in_("status", ["done", "cancelled"])
        .lt("due_date", today.isoformat())
        .execute()
    )
    in_review_count_co = (
        supabase.table("tasks")
        .select("id", count="exact", head=True)
        .eq("assignee_id", user_id)
        .in_("workspace_id", ws_ids)
        .eq("status", "in_review")
        .execute()
    )

    coros = [
        assigned_co, due_co, overdue_co, done_week_co,
        open_count_co, done_week_count_co, overdue_count_co, in_review_count_co,
    ]
    if proj_ids:
        coros.append(
            supabase.table("sprints")
            .select("id, name, project_id, start_at, end_at")
            .in_("project_id", proj_ids)
            .eq("status", "active")
            .order("start_at", desc=False)
            .limit(20)
            .execute()
        )
        coros.append(
            supabase.table("tasks")
            .select("id, identifier, title, project_id, updated_at")
            .in_("project_id", proj_ids)
            .order("updated_at", desc=True)
            .limit(200)
            .execute()
        )

    results = await asyncio.gather(*coros)
    (
        assigned_r, due_r, overdue_r, done_week_r,
        open_r, done_w_r, overdue_count_r, in_review_r,
        *rest,
    ) = results
    assigned_rows = assigned_r.data
    due_rows = due_r.data
    overdue_rows = overdue_r.data
    done_week_rows = done_week_r.data
    open_count = open_r.count or 0
    done_this_week_count = done_w_r.count or 0
    overdue_count = overdue_count_r.count or 0
    in_review_count = in_review_r.count or 0
    active_sprint_rows: list[dict] = rest[0].data if proj_ids else []
    recent_task_rows: list[dict] = rest[1].data if proj_ids else []

    # Stage 3: activity_log depends on the task ids we just fetched.
    activity_rows: list[dict] = []
    activity_task_map: dict[str, dict] = {t["id"]: t for t in recent_task_rows}
    actor_email_map: dict[str, str] = {}
    actor_display_name_map: dict[str, str] = {}
    if activity_task_map:
        activity_rows = (
            await supabase.table("activity_log")
            .select("id, task_id, actor_id, action, payload, created_at")
            .in_("task_id", list(activity_task_map.keys()))
            .order("created_at", desc=True)
            .limit(15)
            .execute()
        ).data

        actor_ids = list(
            {r["actor_id"] for r in activity_rows if r.get("actor_id")}
        )
        if actor_ids:
            # auth.admin API is async on AsyncClient — still a single
            # blocking call relative to the gather'd queries above, but
            # cheap enough at this point in the request.
            try:
                users = await supabase.auth.admin.list_users()
                for u in users:
                    if u.id in actor_ids:
                        if u.email:
                            actor_email_map[u.id] = u.email
                        meta = u.user_metadata or {}
                        dn = meta.get("display_name")
                        if dn:
                            actor_display_name_map[u.id] = dn
            except Exception:
                pass  # graceful: activity feed shows "Someone" if lookup fails

    def _enrich_task(row: dict) -> DashboardTask:
        pid = row["project_id"]
        wid = proj_ws_map.get(pid, "")
        return DashboardTask(
            id=row["id"],
            identifier=row["identifier"],
            title=row["title"],
            status=row["status"],
            workspace_slug=ws_slug_map.get(wid, ""),
            project_key=proj_key_map.get(pid, ""),
            project_name=proj_name_map.get(pid, ""),
            due_date=row.get("due_date"),
            updated_at=row["updated_at"],
        )

    def _enrich_sprint(row: dict) -> DashboardSprint:
        pid = row["project_id"]
        wid = proj_ws_map.get(pid, "")
        return DashboardSprint(
            id=row["id"],
            name=row["name"],
            workspace_slug=ws_slug_map.get(wid, ""),
            project_key=proj_key_map.get(pid, ""),
            start_at=row.get("start_at"),
            end_at=row.get("end_at"),
        )

    def _enrich_activity(row: dict) -> DashboardActivity | None:
        task = activity_task_map.get(row["task_id"])
        if not task:
            return None
        pid = task["project_id"]
        wid = proj_ws_map.get(pid, "")
        aid = row.get("actor_id")
        return DashboardActivity(
            id=row["id"],
            task_id=row["task_id"],
            task_identifier=task["identifier"],
            task_title=task["title"],
            workspace_slug=ws_slug_map.get(wid, ""),
            project_key=proj_key_map.get(pid, ""),
            actor_id=aid,
            actor_email=actor_email_map.get(aid) if aid else None,
            actor_display_name=actor_display_name_map.get(aid) if aid else None,
            action=row["action"],
            payload=row.get("payload") or {},
            created_at=row["created_at"],
        )

    recent_activity = [
        a for a in (_enrich_activity(r) for r in activity_rows) if a is not None
    ]

    return DashboardResponse(
        assigned_to_me=[_enrich_task(r) for r in assigned_rows],
        active_sprints=[_enrich_sprint(r) for r in active_sprint_rows],
        due_this_week=[_enrich_task(r) for r in due_rows],
        overdue=[_enrich_task(r) for r in overdue_rows],
        done_this_week_tasks=[_enrich_task(r) for r in done_week_rows],
        stats=DashboardStats(
            open=open_count,
            done_this_week=done_this_week_count,
            overdue=overdue_count,
            in_review=in_review_count,
        ),
        recent_activity=recent_activity,
    )
