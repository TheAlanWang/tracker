"""Comment business logic. Membership derived via comment→issue→workspace_id."""

from supabase import Client

from app.schemas.comment import CommentCreate, CommentResponse, CommentUpdate


class CommentError(Exception):
    pass


class CommentNotFoundError(CommentError):
    pass


class CommentPermissionError(CommentError):
    pass


class IssueNotFoundError(CommentError):
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


def _ensure_member_via_issue(supabase: Client, user_id: str, issue_id: str) -> dict:
    issue = _fetch_issue(supabase, issue_id)
    if not issue:
        raise IssueNotFoundError(issue_id)
    if not _is_member(supabase, user_id=user_id, workspace_id=issue["workspace_id"]):
        raise CommentPermissionError(issue_id)
    return issue


def list_comments(
    supabase: Client, *, user_id: str, issue_id: str
) -> list[CommentResponse]:
    _ensure_member_via_issue(supabase, user_id, issue_id)
    rows = (
        supabase.table("comments")
        .select("*")
        .eq("issue_id", issue_id)
        .order("created_at")
        .execute()
        .data
    )
    return [CommentResponse(**r) for r in rows]


def create_comment(
    supabase: Client, *, user_id: str, issue_id: str, payload: CommentCreate
) -> CommentResponse:
    _ensure_member_via_issue(supabase, user_id, issue_id)
    row = (
        supabase.table("comments")
        .insert({
            "issue_id": issue_id,
            "author_id": user_id,
            "body": payload.body,
        })
        .execute()
        .data[0]
    )
    return CommentResponse(**row)


def update_comment(
    supabase: Client, *, user_id: str, comment_id: str, payload: CommentUpdate
) -> CommentResponse:
    row = (
        supabase.table("comments")
        .select("*")
        .eq("id", comment_id)
        .single()
        .execute()
        .data
    )
    if not row:
        raise CommentNotFoundError(comment_id)
    if row["author_id"] != user_id:
        raise CommentPermissionError(comment_id)
    updated = (
        supabase.table("comments")
        .update({"body": payload.body})
        .eq("id", comment_id)
        .execute()
        .data[0]
    )
    return CommentResponse(**updated)


def delete_comment(
    supabase: Client, *, user_id: str, comment_id: str
) -> None:
    row = (
        supabase.table("comments")
        .select("*")
        .eq("id", comment_id)
        .single()
        .execute()
        .data
    )
    if not row:
        raise CommentNotFoundError(comment_id)
    if row["author_id"] != user_id:
        raise CommentPermissionError(comment_id)
    supabase.table("comments").delete().eq("id", comment_id).execute()
