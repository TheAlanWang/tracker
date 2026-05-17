"""Burndown and velocity computation.

Both metrics are reconstructed from the activity_log on demand — there's no
snapshot table. For a portfolio-scale dataset this is fine; if the tasks-
per-sprint count climbs into the thousands we'd cache.

Burndown is computed for one sprint at a time and counts tasks whose current
sprint_id matches. We don't track tasks that were removed from the sprint
mid-flight (a Jira "scope change" line) — that requires the historical
sprint_id, which would mean walking activity_log for sprint_changed events
and is more complexity than this view warrants.
"""

from datetime import date, datetime, timedelta, timezone

from supabase import Client

from app.schemas.charts import (
    BurndownPoint,
    BurndownResponse,
    VelocityBar,
    VelocityResponse,
)


class ChartError(Exception):
    pass


class SprintNotFoundError(ChartError):
    pass


class SprintNoDatesError(ChartError):
    """Sprint exists but has no start_at/end_at — can't draw a burndown."""


class PermissionError(ChartError):
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


def _parse_date(s: str | None) -> date | None:
    if not s:
        return None
    # accept both date and timestamptz strings
    return datetime.fromisoformat(s.replace("Z", "+00:00")).date()


def compute_burndown(
    supabase: Client, *, user_id: str, sprint_id: str
) -> BurndownResponse:
    sprint = (
        supabase.table("sprints")
        .select("*, projects(workspace_id)")
        .eq("id", sprint_id)
        .single()
        .execute()
        .data
    )
    if not sprint:
        raise SprintNotFoundError(sprint_id)
    workspace_id = sprint["projects"]["workspace_id"]
    if not _is_member(supabase, user_id=user_id, workspace_id=workspace_id):
        raise PermissionError(sprint_id)

    start = _parse_date(sprint.get("start_at"))
    end = _parse_date(sprint.get("end_at"))
    if not start or not end:
        raise SprintNoDatesError(sprint_id)

    tasks = (
        supabase.table("tasks")
        .select("id, status")
        .eq("sprint_id", sprint_id)
        .execute()
        .data
    )
    task_ids = [t["id"] for t in tasks]
    total = len(task_ids)

    # Determine when each task was last set to 'done'. We walk activity_log
    # for status_changed events where the payload's "to" was "done" — but
    # we also need to handle tasks that became 'done' before the migration
    # to activity_log existed (rare for a fresh portfolio project; we treat
    # those as "done at start" so they don't bias the line).
    done_dates: dict[str, date] = {}
    if task_ids:
        events = (
            supabase.table("activity_log")
            .select("task_id, payload, created_at")
            .in_("task_id", task_ids)
            .eq("action", "status_changed")
            .order("created_at")
            .execute()
            .data
        )
        for ev in events:
            payload = ev.get("payload") or {}
            to_status = payload.get("to")
            if to_status == "done":
                d = (
                    datetime.fromisoformat(ev["created_at"].replace("Z", "+00:00"))
                    .astimezone(timezone.utc)
                    .date()
                )
                done_dates[ev["task_id"]] = d
            elif ev["task_id"] in done_dates:
                # task left done state — clear the marker so we don't count
                # it as completed on later days
                del done_dates[ev["task_id"]]
        # Tasks that are currently 'done' but have no event (e.g. created
        # as 'done' directly): fall back to "done at start of sprint".
        for t in tasks:
            if t["status"] == "done" and t["id"] not in done_dates:
                done_dates[t["id"]] = start

    today = datetime.now(timezone.utc).date()
    last_day = min(end, today) if today > start else end

    span_days = max((end - start).days, 1)
    points: list[BurndownPoint] = []
    cursor = start
    while cursor <= last_day:
        completed_by_today = sum(
            1 for d in done_dates.values() if d <= cursor
        )
        offset = (cursor - start).days
        ideal = max(total - (total * offset / span_days), 0.0)
        points.append(
            BurndownPoint(
                day=cursor,
                remaining=total - completed_by_today,
                ideal=round(ideal, 2),
            )
        )
        cursor = cursor + timedelta(days=1)

    # Always include the final end-day ideal point so the dashed line
    # extends to the right edge even if today < end.
    if last_day < end:
        points.append(BurndownPoint(day=end, remaining=points[-1].remaining, ideal=0.0))

    return BurndownResponse(
        sprint_id=sprint_id,
        total=total,
        start=start,
        end=end,
        points=points,
    )


def compute_velocity(
    supabase: Client, *, user_id: str, project_id: str
) -> VelocityResponse:
    project = (
        supabase.table("projects")
        .select("workspace_id")
        .eq("id", project_id)
        .single()
        .execute()
        .data
    )
    if not project:
        raise SprintNotFoundError(project_id)
    if not _is_member(supabase, user_id=user_id, workspace_id=project["workspace_id"]):
        raise PermissionError(project_id)

    completed_sprints = (
        supabase.table("sprints")
        .select("*")
        .eq("project_id", project_id)
        .eq("status", "completed")
        .order("end_at", desc=True)
        .limit(10)
        .execute()
        .data
    )
    # Reverse to ascending so the bar chart reads left-to-right oldest→newest.
    completed_sprints.reverse()

    bars: list[VelocityBar] = []
    for s in completed_sprints:
        tasks = (
            supabase.table("tasks")
            .select("id, status")
            .eq("sprint_id", s["id"])
            .execute()
            .data
        )
        total = len(tasks)
        completed = sum(1 for t in tasks if t["status"] == "done")
        bars.append(
            VelocityBar(
                sprint_id=s["id"],
                sprint_name=s["name"],
                end_at=_parse_date(s.get("end_at")),
                total=total,
                completed=completed,
            )
        )

    return VelocityResponse(project_id=project_id, bars=bars)
