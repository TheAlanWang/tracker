"""Transactional email sender for task-assignment notifications.

Fire-and-forget via FastAPI BackgroundTasks: failures log and drop —
email delivery isn't on the critical path of task creation / update,
so a Resend hiccup doesn't fail the user-facing API call.

`should_email_assignment` is a pure function — kept that way so the
decision logic (threshold comparison + create/reassign/priority-bump
trigger conditions) is unit-testable without mocking Resend or
Supabase.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

from supabase import AsyncClient

from app.core.config import get_settings
from app.schemas.project import NotifyAssigneeThreshold
from app.schemas.task import TaskPriority, TaskResponse, TaskStatus
from app.services._email_templates import render_assignment_email

logger = logging.getLogger(__name__)


# Larger number = higher priority. Used by _meets_threshold to decide if
# a task's priority qualifies for emails under the project's threshold.
_PRIORITY_RANK: dict[str, int] = {
    "no_priority": 0,
    "low": 1,
    "medium": 2,
    "high": 3,
    "urgent": 4,
}

# Minimum priority rank required for each threshold setting.
_THRESHOLD_MIN_RANK: dict[str, int] = {
    "urgent": _PRIORITY_RANK["urgent"],
    "high": _PRIORITY_RANK["high"],
    "any": _PRIORITY_RANK["no_priority"],  # everything passes
}


def _meets_threshold(
    priority: TaskPriority | None, threshold: NotifyAssigneeThreshold
) -> bool:
    if threshold == "off" or priority is None:
        return False
    return _PRIORITY_RANK.get(priority, 0) >= _THRESHOLD_MIN_RANK[threshold]


def should_email_assignment(
    *,
    old_priority: TaskPriority | None,
    new_priority: TaskPriority,
    old_assignee: str | None,
    new_assignee: str | None,
    new_status: TaskStatus,
    actor_id: str,
    threshold: NotifyAssigneeThreshold,
) -> str | None:
    """Decide whether to send an assignment email; return the recipient
    user_id or None.

    Fires when an assignment "enters" the threshold zone:
      1. Create: brand-new task with assignee at or above threshold
         (caller passes old_priority=None, old_assignee=None)
      2. Reassign: assignee_id changes to a non-null value, and the
         current priority meets the threshold
      3. Priority bumped: priority crosses up into the threshold while
         the task already has an assignee

    Suppressed when:
      - assignee == actor (self-assign)
      - the task is already done or cancelled (no point pinging
        someone about a task they don't need to act on)
    """
    if threshold == "off":
        return None
    if new_status in ("done", "cancelled"):
        return None
    if new_assignee is None or new_assignee == actor_id:
        return None
    if not _meets_threshold(new_priority, threshold):
        return None

    # Create path — caller marks absence of prior state with both Nones.
    if old_priority is None and old_assignee is None:
        return new_assignee
    # Reassign — assignee changed.
    if old_assignee != new_assignee:
        return new_assignee
    # Priority bumped *into* the threshold zone (old didn't meet, new does).
    if old_priority != new_priority and not _meets_threshold(old_priority, threshold):
        return new_assignee
    return None


async def _resolve_user(supabase: AsyncClient, user_id: str) -> Any | None:
    """Fetch a single auth.users row via the admin API. Returns the user
    object (with .email and .user_metadata) or None on miss / error."""
    try:
        resp = await supabase.auth.admin.get_user_by_id(user_id)
        return resp.user if resp else None
    except Exception:  # noqa: BLE001 — admin API errors shouldn't block email path
        logger.exception("[email] failed to resolve user %s", user_id)
        return None


def _display_name(user: Any, fallback: str = "Someone") -> str:
    meta = user.user_metadata or {}
    return (meta.get("display_name") or user.email or fallback).strip() or fallback


async def send_assignment_email(
    supabase: AsyncClient,
    *,
    task: TaskResponse,
    project_name: str,
    project_key: str,
    workspace_slug: str,
    threshold: NotifyAssigneeThreshold,
    assignee_id: str,
    actor_id: str,
) -> None:
    """Fire-and-forget email send. Logs and returns on any failure."""
    settings = get_settings()

    if threshold == "off":
        # Defensive double-check — caller has already gated on threshold,
        # but the background task may fire after a flip to 'off' between
        # scheduling and execution.
        return
    if not settings.resend_api_key:
        logger.info(
            "[email] skipping assignment email for %s — RESEND_API_KEY unset",
            task.identifier,
        )
        return

    assignee = await _resolve_user(supabase, assignee_id)
    if not assignee or not assignee.email:
        return
    actor = await _resolve_user(supabase, actor_id)

    actor_name = _display_name(actor) if actor else "Someone"
    assignee_name = _display_name(
        assignee, fallback=(assignee.email or "").split("@", 1)[0] or "there"
    )

    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    task_url = f"{frontend_url}/w/{workspace_slug}/p/{project_key}/tasks/{task.identifier}"
    settings_url = f"{frontend_url}/w/{workspace_slug}/p/{project_key}/settings"

    # Bracket the subject with priority only for urgent / high; for medium
    # and below the priority is noise in the inbox preview.
    if task.priority in ("urgent", "high"):
        subject = f"[{task.priority.capitalize()}] {task.identifier}: {task.title}"
    else:
        subject = f"{task.identifier}: {task.title}"

    html, text = render_assignment_email(
        assignee_name=assignee_name,
        actor_name=actor_name,
        project_name=project_name,
        task_identifier=task.identifier,
        task_title=task.title,
        task_priority=task.priority,
        due_date=task.due_date,
        task_url=task_url,
        settings_url=settings_url,
    )

    # Import lazily so apps without resend installed (test env) still
    # import this module cleanly; we already guarded on api_key above.
    import resend

    resend.api_key = settings.resend_api_key
    payload = {
        "from": settings.email_sender,
        "to": assignee.email,
        "subject": subject,
        "html": html,
        "text": text,
    }
    try:
        # resend's Python SDK is sync; offload to a thread so we don't
        # block the FastAPI event loop on the HTTPS round-trip.
        await asyncio.to_thread(resend.Emails.send, payload)
        logger.info(
            "[email] sent assignment %s to %s", task.identifier, assignee.email
        )
    except Exception:  # noqa: BLE001
        logger.exception(
            "[email] resend send failed for %s → %s", task.identifier, assignee.email
        )
