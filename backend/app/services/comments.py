"""Comment business logic. Membership derived via comment→task→workspace_id.

Also handles @mention parsing on create — any `@<handle>` token in the body
that matches a workspace member's display_name first word OR email local
part fires a `mentioned` notification to that member. Self-mentions and
the comment author are skipped.
"""

import base64
import json
import re

from supabase import AsyncClient

from app.schemas.comment import (
    CommentCreate,
    CommentPage,
    CommentResponse,
    CommentUpdate,
)


class CommentError(Exception):
    pass


class CommentNotFoundError(CommentError):
    pass


class CommentPermissionError(CommentError):
    pass


class TaskNotFoundError(CommentError):
    pass


class InvalidCursorError(CommentError):
    pass


# Opaque keyset cursor: base64url({"t": created_at_iso, "id": comment_id}).
# Clients echo it back verbatim; a cursor is only valid for the order that
# produced it (mixing orders is a client error, not validated here).
def _encode_cursor(created_at: str, comment_id: str) -> str:
    raw = json.dumps({"t": created_at, "id": comment_id}).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _decode_cursor(cursor: str) -> tuple[str, str]:
    try:
        pad = "=" * (-len(cursor) % 4)
        data = json.loads(base64.urlsafe_b64decode(cursor + pad))
        return str(data["t"]), str(data["id"])
    except (ValueError, KeyError, TypeError) as exc:
        raise InvalidCursorError(cursor) from exc


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


async def _ensure_member_via_task(supabase: AsyncClient, user_id: str, task_id: str) -> dict:
    task = await _fetch_task(supabase, task_id)
    if not task:
        raise TaskNotFoundError(task_id)
    if not await _is_member(supabase, user_id=user_id, workspace_id=task["workspace_id"]):
        raise CommentPermissionError(task_id)
    return task


async def list_comments(
    supabase: AsyncClient, *, user_id: str, task_id: str
) -> list[CommentResponse]:
    await _ensure_member_via_task(supabase, user_id, task_id)
    rows = (
        await supabase.table("comments")
        .select("*")
        .eq("task_id", task_id)
        .order("created_at")
        .execute()
    ).data
    return [CommentResponse(**r) for r in rows]


async def list_comments_page(
    supabase: AsyncClient,
    *,
    user_id: str,
    task_id: str,
    limit: int,
    cursor: str | None = None,
    order: str = "newest",
) -> CommentPage:
    """Keyset-paginated read. `total` needs its own head-count query:
    counting on the page query would count the rows *after* the cursor
    filter, i.e. the remainder, not the task's true comment count."""
    await _ensure_member_via_task(supabase, user_id, task_id)

    count_res = (
        await supabase.table("comments")
        .select("id", count="exact", head=True)
        .eq("task_id", task_id)
        .execute()
    )
    total = count_res.count or 0

    desc = order == "newest"
    q = supabase.table("comments").select("*").eq("task_id", task_id)
    if cursor:
        t, cid = _decode_cursor(cursor)
        op = "lt" if desc else "gt"
        # PostgREST has no tuple comparison; emulate
        # (created_at, id) < (t, cid) with an OR. Values are quoted — ISO
        # timestamps contain chars reserved by the or= syntax.
        q = q.or_(
            f'created_at.{op}."{t}",and(created_at.eq."{t}",id.{op}."{cid}")'
        )
    rows = (
        await q.order("created_at", desc=desc)
        .order("id", desc=desc)
        .limit(limit + 1)  # probe row: detects has_more without a 2nd query
        .execute()
    ).data
    has_more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = (
        _encode_cursor(rows[-1]["created_at"], rows[-1]["id"])
        if has_more and rows
        else None
    )
    return CommentPage(
        items=[CommentResponse(**r) for r in rows],
        total=total,
        next_cursor=next_cursor,
    )


_MENTION_RE = re.compile(r"@([A-Za-z0-9._-]+)")


async def _fan_out_mentions(
    supabase: AsyncClient,
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
        await supabase.table("tasks")
        .select("workspace_id, identifier, title")
        .eq("id", task_id)
        .execute()
    ).data
    if not task_rows:
        return
    workspace_id = task_rows[0]["workspace_id"]
    task_identifier = task_rows[0]["identifier"]
    task_title = task_rows[0]["title"]

    member_rows = (
        await supabase.table("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspace_id)
        .execute()
    ).data
    member_ids = {r["user_id"] for r in member_rows}
    if not member_ids:
        return

    # Match handles against display_name first word OR email local part.
    # Both lookups need the supabase admin API since that data lives on
    # auth.users / user_metadata.
    matched: list[str] = []
    try:
        users = await supabase.auth.admin.list_users()
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
            await supabase.table("notifications").insert(
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


async def create_comment(
    supabase: AsyncClient, *, user_id: str, task_id: str, payload: CommentCreate
) -> CommentResponse:
    await _ensure_member_via_task(supabase, user_id, task_id)
    row = (
        await supabase.table("comments")
        .insert({
            "task_id": task_id,
            "author_id": user_id,
            "body": payload.body,
        })
        .execute()
    ).data[0]
    await _fan_out_mentions(
        supabase,
        task_id=task_id,
        author_id=user_id,
        body=payload.body,
        comment_id=row["id"],
    )
    return CommentResponse(**row)


async def update_comment(
    supabase: AsyncClient, *, user_id: str, comment_id: str, payload: CommentUpdate
) -> CommentResponse:
    row = (
        await supabase.table("comments")
        .select("*")
        .eq("id", comment_id)
        .single()
        .execute()
    ).data
    if not row:
        raise CommentNotFoundError(comment_id)
    if row["author_id"] != user_id:
        raise CommentPermissionError(comment_id)
    updated = (
        await supabase.table("comments")
        .update({"body": payload.body})
        .eq("id", comment_id)
        .execute()
    ).data[0]
    return CommentResponse(**updated)


async def delete_comment(
    supabase: AsyncClient, *, user_id: str, comment_id: str
) -> None:
    row = (
        await supabase.table("comments")
        .select("*")
        .eq("id", comment_id)
        .single()
        .execute()
    ).data
    if not row:
        raise CommentNotFoundError(comment_id)
    if row["author_id"] != user_id:
        raise CommentPermissionError(comment_id)
    await supabase.table("comments").delete().eq("id", comment_id).execute()