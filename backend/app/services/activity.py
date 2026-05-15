"""Activity log business logic. Reads from activity_log (written by DB triggers)."""

from supabase import Client

from app.schemas.activity import ActivityResponse


class ActivityError(Exception):
    pass


class IssueNotFoundError(ActivityError):
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


def _fetch_issue(supabase: Client, issue_id: str) -> dict | None:
    return (
        supabase.table("issues")
        .select("*")
        .eq("id", issue_id)
        .single()
        .execute()
        .data
    )


def list_issue_activity(
    supabase: Client,
    *,
    user_id: str,
    issue_id: str,
) -> list[ActivityResponse]:
    issue = _fetch_issue(supabase, issue_id)
    if not issue:
        raise IssueNotFoundError(issue_id)
    if not _is_member(supabase, user_id=user_id, workspace_id=issue["workspace_id"]):
        raise ActivityPermissionError(issue_id)
    rows = (
        supabase.table("activity_log")
        .select("*")
        .eq("issue_id", issue_id)
        .order("created_at", desc=True)
        .limit(200)
        .execute()
        .data
    )
    return [ActivityResponse(**r) for r in rows]
