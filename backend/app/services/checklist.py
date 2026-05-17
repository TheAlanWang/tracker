"""Task checklist business logic.

Checklist items are lightweight TODO bullets scoped to a single task —
not independent tasks. Membership is derived through task → workspace.
"""

from supabase import Client

from app.schemas.checklist import (
    ChecklistItemCreate,
    ChecklistItemResponse,
    ChecklistItemUpdate,
)


class ChecklistError(Exception):
    pass


class ChecklistNotFoundError(ChecklistError):
    pass


class ChecklistPermissionError(ChecklistError):
    pass


class TaskNotFoundError(ChecklistError):
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


def _ensure_member_via_task(supabase: Client, user_id: str, task_id: str) -> dict:
    task = (
        supabase.table("tasks")
        .select("workspace_id")
        .eq("id", task_id)
        .single()
        .execute()
        .data
    )
    if not task:
        raise TaskNotFoundError(task_id)
    if not _is_member(supabase, user_id=user_id, workspace_id=task["workspace_id"]):
        raise ChecklistPermissionError(task_id)
    return task


def _ensure_member_via_item(
    supabase: Client, user_id: str, item_id: str
) -> dict:
    item = (
        supabase.table("task_checklist_items")
        .select("*")
        .eq("id", item_id)
        .single()
        .execute()
        .data
    )
    if not item:
        raise ChecklistNotFoundError(item_id)
    _ensure_member_via_task(supabase, user_id, item["task_id"])
    return item


def list_items(
    supabase: Client, *, user_id: str, task_id: str
) -> list[ChecklistItemResponse]:
    _ensure_member_via_task(supabase, user_id, task_id)
    rows = (
        supabase.table("task_checklist_items")
        .select("*")
        .eq("task_id", task_id)
        .order("position")
        .order("created_at")
        .execute()
        .data
    )
    return [ChecklistItemResponse(**r) for r in rows]


def create_item(
    supabase: Client,
    *,
    user_id: str,
    task_id: str,
    payload: ChecklistItemCreate,
) -> ChecklistItemResponse:
    _ensure_member_via_task(supabase, user_id, task_id)
    # Position auto-advances so new items append. Read current max and add 1
    # — fine for portfolio scale; under high concurrency we'd use a sequence.
    existing = (
        supabase.table("task_checklist_items")
        .select("position")
        .eq("task_id", task_id)
        .order("position", desc=True)
        .limit(1)
        .execute()
        .data
    )
    next_pos = (existing[0]["position"] + 1) if existing else 0
    row = (
        supabase.table("task_checklist_items")
        .insert({
            "task_id": task_id,
            "text": payload.text,
            "position": next_pos,
        })
        .execute()
        .data[0]
    )
    return ChecklistItemResponse(**row)


def update_item(
    supabase: Client,
    *,
    user_id: str,
    item_id: str,
    payload: ChecklistItemUpdate,
) -> ChecklistItemResponse:
    item = _ensure_member_via_item(supabase, user_id, item_id)
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return ChecklistItemResponse(**item)
    updated = (
        supabase.table("task_checklist_items")
        .update(updates)
        .eq("id", item_id)
        .execute()
        .data[0]
    )
    return ChecklistItemResponse(**updated)


def delete_item(
    supabase: Client, *, user_id: str, item_id: str
) -> None:
    _ensure_member_via_item(supabase, user_id, item_id)
    supabase.table("task_checklist_items").delete().eq("id", item_id).execute()
