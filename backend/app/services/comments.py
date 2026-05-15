"""Comment business logic. Membership derived via comment→task→workspace_id."""

from supabase import Client

from app.schemas.comment import CommentCreate, CommentResponse, CommentUpdate


class CommentError(Exception):
    pass


class CommentNotFoundError(CommentError):
    pass


class CommentPermissionError(CommentError):
    pass


class TaskNotFoundError(CommentError):
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


def _ensure_member_via_task(supabase: Client, user_id: str, task_id: str) -> dict:
    task = _fetch_task(supabase, task_id)
    if not task:
        raise TaskNotFoundError(task_id)
    if not _is_member(supabase, user_id=user_id, workspace_id=task["workspace_id"]):
        raise CommentPermissionError(task_id)
    return task


def list_comments(
    supabase: Client, *, user_id: str, task_id: str
) -> list[CommentResponse]:
    _ensure_member_via_task(supabase, user_id, task_id)
    rows = (
        supabase.table("comments")
        .select("*")
        .eq("task_id", task_id)
        .order("created_at")
        .execute()
        .data
    )
    return [CommentResponse(**r) for r in rows]


def create_comment(
    supabase: Client, *, user_id: str, task_id: str, payload: CommentCreate
) -> CommentResponse:
    _ensure_member_via_task(supabase, user_id, task_id)
    row = (
        supabase.table("comments")
        .insert({
            "task_id": task_id,
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
