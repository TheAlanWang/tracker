"""Cross-workspace personal dashboard aggregation."""

from datetime import date, timedelta

from supabase import Client

from app.schemas.dashboard import DashboardTask, DashboardResponse, DashboardSprint


def get_dashboard(supabase: Client, *, user_id: str) -> DashboardResponse:
    # 1. Fetch user's workspace_ids via workspace_members
    member_rows = (
        supabase.table("workspace_members")
        .select("workspace_id")
        .eq("user_id", user_id)
        .execute()
        .data
    )
    if not member_rows:
        return DashboardResponse(
            assigned_to_me=[],
            active_sprints=[],
            due_this_week=[],
        )

    ws_ids = [r["workspace_id"] for r in member_rows]

    # 2. Fetch user's workspaces (id, slug) to build id→slug map
    ws_rows = (
        supabase.table("workspaces")
        .select("id, slug")
        .in_("id", ws_ids)
        .execute()
        .data
    )
    ws_slug_map: dict[str, str] = {r["id"]: r["slug"] for r in ws_rows}

    # 3. Fetch user's projects in those workspaces to build project_id→key and project_id→workspace_id maps
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

    # 4. Assigned to me: tasks WHERE assignee_id=user_id AND workspace_id IN ws_ids ORDER BY updated_at DESC LIMIT 20
    assigned_rows = (
        supabase.table("tasks")
        .select("id, identifier, title, status, project_id, due_date, updated_at")
        .eq("assignee_id", user_id)
        .in_("workspace_id", ws_ids)
        .order("updated_at", desc=True)
        .limit(20)
        .execute()
        .data
    )

    # 5. Due this week: tasks WHERE assignee_id=user_id AND due_date BETWEEN today AND today+7 ORDER BY due_date ASC LIMIT 20
    today = date.today()
    week_end = today + timedelta(days=7)
    due_rows = (
        supabase.table("tasks")
        .select("id, identifier, title, status, project_id, due_date, updated_at")
        .eq("assignee_id", user_id)
        .gte("due_date", today.isoformat())
        .lte("due_date", week_end.isoformat())
        .order("due_date", desc=False)
        .limit(20)
        .execute()
        .data
    )

    # 6. Active sprints: sprints WHERE project_id IN proj_ids AND status='active' ORDER BY start_at LIMIT 20
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

    return DashboardResponse(
        assigned_to_me=[_enrich_task(r) for r in assigned_rows],
        active_sprints=[_enrich_sprint(r) for r in active_sprint_rows],
        due_this_week=[_enrich_task(r) for r in due_rows],
    )
