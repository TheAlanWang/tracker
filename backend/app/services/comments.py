"""Comment business logic. Membership derived via comment→task→workspace_id.

Also handles @mention parsing on create — any `@<handle>` token in the body
that matches a workspace member's display_name first word OR email local
part fires a `mentioned` notification to that member. Self-mentions and
the comment author are skipped.
"""

import re

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


_MENTION_RE = re.compile(r"@([A-Za-z0-9._-]+)")


def _fan_out_mentions(
    supabase: Client,
    *,
    task_id: str,
    author_id: str,
    body: str,
    comment_id: str,
) -> None:
    """Parse `@handle` tokens in `body`, match against workspace members of
    the task's workspace, and insert a `mentioned` notification per match.
    Failures are swallowed — comment creation must not be blocked by a
    flaky admin API call when looking up emails."""
    handles = {h.lower() for h in _MENTION_RE.findall(body)}
    if not handles:
        return

    # Resolve the task's workspace so we only mention people who can actually
    # see this task.
    task_rows = (
        supabase.table("tasks")
        .select("workspace_id, identifier, title")
        .eq("id", task_id)
        .execute()
        .data
    )
    if not task_rows:
        return
    workspace_id = task_rows[0]["workspace_id"]
    task_identifier = task_rows[0]["identifier"]
    task_title = task_rows[0]["title"]

    member_rows = (
        supabase.table("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspace_id)
        .execute()
        .data
    )
    member_ids = {r["user_id"] for r in member_rows}
    if not member_ids:
        return

    # Match handles against display_name first word OR email local part.
    # Both lookups need the supabase admin API since that data lives on
    # auth.users / user_metadata.
    matched: list[str] = []
    try:
        users = supabase.auth.admin.list_users()
        for u in users:
            if u.id not in member_ids:
                continue
            if u.id == author_id:
                continue  # never notify yourself for mentioning yourself
            email_local = (u.email or "").split("@", 1)[0].lower()
            meta = u.user_metadata or {}
            display = (meta.get("display_name") or "").strip()
            first_word = display.split(" ", 1)[0].lower() if display else ""
            if (email_local and email_local in handles) or (
                first_word and first_word in handles
            ):
                matched.append(u.id)
    except Exception:
        return  # graceful: comment still saves, just no mention notifs

    for mentioned_id in matched:
        try:
            supabase.table("notifications").insert(
                {
                    "user_id": mentioned_id,
                    "type": "mentioned",
                    "task_id": task_id,
                    "actor_id": author_id,
                    "payload": {
                        "identifier": task_identifier,
                        "title": task_title,
                        "comment_id": comment_id,
                        "preview": body[:200],
                    },
                }
            ).execute()
        except Exception:
            pass  # swallow per-row failures — better than half-notified


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
    _fan_out_mentions(
        supabase,
        task_id=task_id,
        author_id=user_id,
        body=payload.body,
        comment_id=row["id"],
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
