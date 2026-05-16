"""Cross-workspace personal dashboard aggregation."""

from datetime import date, datetime, timedelta, timezone

from supabase import Client

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
        stats=DashboardStats(open=0, done_this_week=0, overdue=0, in_review=0),
        recent_activity=[],
    )


def get_dashboard(
    supabase: Client,
    *,
    user_id: str,
    workspace_id: str | None = None,
) -> DashboardResponse:
    member_rows = (
        supabase.table("workspace_members")
        .select("workspace_id")
        .eq("user_id", user_id)
        .execute()
        .data
    )
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

    ws_rows = (
        supabase.table("workspaces")
        .select("id, slug")
        .in_("id", ws_ids)
        .execute()
        .data
    )
    ws_slug_map: dict[str, str] = {r["id"]: r["slug"] for r in ws_rows}

    proj_rows = (
        supabase.table("projects")
        .select("id, key, workspace_id")
        .in_("workspace_id", ws_ids)
        .execute()
        .data
    )
    proj_key_map: dict[str, str] = {r["id"]: r["key"] for r in proj_rows}
    proj_ws_map: dict[str, str] = {r["id"]: r["workspace_id"] for r in proj_rows}
    proj_ids = list(proj_key_map.keys())

    today = date.today()
    week_end = today + timedelta(days=7)
    week_ago_dt = datetime.now(timezone.utc) - timedelta(days=7)

    # 1. Assigned to me (recent 20)
    assigned_rows = (
        supabase.table("tasks")
        .select("id, identifier, title, status, project_id, due_date, updated_at")
        .eq("assignee_id", user_id)
        .in_("workspace_id", ws_ids)
        .not_.in_("status", ["done", "cancelled"])
        .order("updated_at", desc=True)
        .limit(20)
        .execute()
        .data
    )

    # 2. Due this week (assigned to me, due_date within next 7 days, not done)
    due_rows = (
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
        .data
    )

    # 3. Overdue (assigned to me, due_date < today, not done/cancelled)
    overdue_rows = (
        supabase.table("tasks")
        .select("id, identifier, title, status, project_id, due_date, updated_at")
        .eq("assignee_id", user_id)
        .in_("workspace_id", ws_ids)
        .not_.in_("status", ["done", "cancelled"])
        .lt("due_date", today.isoformat())
        .order("due_date", desc=False)
        .limit(20)
        .execute()
        .data
    )

    # 4. Active sprints
    active_sprint_rows: list[dict] = []
    if proj_ids:
        active_sprint_rows = (
            supabase.table("sprints")
            .select("id, name, project_id, start_at, end_at")
            .in_("project_id", proj_ids)
            .eq("status", "active")
            .order("start_at", desc=False)
            .limit(20)
            .execute()
            .data
        )

    # 5. KPI counts — exact counts (use head=True to skip row payload)
    def _count(query) -> int:
        res = query.execute()
        return res.count or 0

    open_count = _count(
        supabase.table("tasks")
        .select("id", count="exact", head=True)
        .eq("assignee_id", user_id)
        .in_("workspace_id", ws_ids)
        .not_.in_("status", ["done", "cancelled"])
    )
    done_this_week_count = _count(
        supabase.table("tasks")
        .select("id", count="exact", head=True)
        .eq("assignee_id", user_id)
        .in_("workspace_id", ws_ids)
        .eq("status", "done")
        .gte("updated_at", week_ago_dt.isoformat())
    )
    overdue_count = _count(
        supabase.table("tasks")
        .select("id", count="exact", head=True)
        .eq("assignee_id", user_id)
        .in_("workspace_id", ws_ids)
        .not_.in_("status", ["done", "cancelled"])
        .lt("due_date", today.isoformat())
    )
    in_review_count = _count(
        supabase.table("tasks")
        .select("id", count="exact", head=True)
        .eq("assignee_id", user_id)
        .in_("workspace_id", ws_ids)
        .eq("status", "in_review")
    )

    # 6. Recent activity across user's workspaces (most recent 15)
    activity_rows: list[dict] = []
    activity_task_map: dict[str, dict] = {}
    actor_email_map: dict[str, str] = {}
    if proj_ids:
        # Fetch recent tasks across all my projects to scope activity_log
        recent_task_rows = (
            supabase.table("tasks")
            .select("id, identifier, title, project_id, updated_at")
            .in_("project_id", proj_ids)
            .order("updated_at", desc=True)
            .limit(200)
            .execute()
            .data
        )
        activity_task_map = {t["id"]: t for t in recent_task_rows}

        if activity_task_map:
            activity_rows = (
                supabase.table("activity_log")
                .select("id, task_id, actor_id, action, payload, created_at")
                .in_("task_id", list(activity_task_map.keys()))
                .order("created_at", desc=True)
                .limit(15)
                .execute()
                .data
            )

            actor_ids = list(
                {r["actor_id"] for r in activity_rows if r.get("actor_id")}
            )
            if actor_ids:
                # email lives on auth.users, not workspace_members; use the
                # auth admin API (same pattern as services/members.py).
                try:
                    users = supabase.auth.admin.list_users()
                    for u in users:
                        if u.id in actor_ids and u.email:
                            actor_email_map[u.id] = u.email
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
        return DashboardActivity(
            id=row["id"],
            task_id=row["task_id"],
            task_identifier=task["identifier"],
            task_title=task["title"],
            workspace_slug=ws_slug_map.get(wid, ""),
            project_key=proj_key_map.get(pid, ""),
            actor_id=row.get("actor_id"),
            actor_email=actor_email_map.get(row["actor_id"]) if row.get("actor_id") else None,
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
        stats=DashboardStats(
            open=open_count,
            done_this_week=done_this_week_count,
            overdue=overdue_count,
            in_review=in_review_count,
        ),
        recent_activity=recent_activity,
    )
