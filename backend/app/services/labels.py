"""Label business logic. Workspace-scoped + per-task attach/detach."""

from postgrest.exceptions import APIError
from supabase import AsyncClient

from app.schemas.label import LabelCreate, LabelResponse


class LabelError(Exception):
    pass


class LabelNotFoundError(LabelError):
    pass


class LabelPermissionError(LabelError):
    pass


class LabelNameExistsError(LabelError):
    pass


class TaskNotFoundError(LabelError):
    pass


async def _is_member(supabase: AsyncClient, *, user_id: str, workspace_id: str) -> bool:
    rows = (
        await supabase.table("workspace_members")
        .select("role")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .execute()
    ).data
    return bool(rows)


async def list_labels(
    supabase: AsyncClient, *, user_id: str, workspace_id: str
) -> list[LabelResponse]:
    if not await _is_member(supabase, user_id=user_id, workspace_id=workspace_id):
        raise LabelPermissionError(workspace_id)
    rows = (
        await supabase.table("labels")
        .select("*")
        .eq("workspace_id", workspace_id)
        .order("name")
        .execute()
    ).data
    return [LabelResponse(**r) for r in rows]


async def create_label(
    supabase: AsyncClient, *, user_id: str, workspace_id: str, payload: LabelCreate
) -> LabelResponse:
    if not await _is_member(supabase, user_id=user_id, workspace_id=workspace_id):
        raise LabelPermissionError(workspace_id)
    try:
        row = (
            await supabase.table("labels")
            .insert({
                "workspace_id": workspace_id,
                "name": payload.name,
                "color": payload.color,
            })
            .execute()
        ).data[0]
    except APIError as exc:
        if exc.code == "23505":
            raise LabelNameExistsError(payload.name) from exc
        raise
    return LabelResponse(**row)


async def delete_label(supabase: AsyncClient, *, user_id: str, label_id: str) -> None:
    row = (
        await supabase.table("labels")
        .select("workspace_id")
        .eq("id", label_id)
        .single()
        .execute()
    ).data
    if not row:
        raise LabelNotFoundError(label_id)
    if not await _is_member(supabase, user_id=user_id, workspace_id=row["workspace_id"]):
        raise LabelPermissionError(label_id)
    await supabase.table("labels").delete().eq("id", label_id).execute()
async def list_task_labels(
    supabase: AsyncClient, *, user_id: str, task_id: str
) -> list[LabelResponse]:
    task = (
        await supabase.table("tasks")
        .select("workspace_id")
        .eq("id", task_id)
        .single()
        .execute()
    ).data
    if not task:
        raise TaskNotFoundError(task_id)
    if not await _is_member(supabase, user_id=user_id, workspace_id=task["workspace_id"]):
        raise LabelPermissionError(task_id)
    # Two-query approach: get label_ids via join table, then fetch labels
    rels = (
        await supabase.table("task_labels")
        .select("label_id")
        .eq("task_id", task_id)
        .execute()
    ).data
    if not rels:
        return []
    label_ids = [r["label_id"] for r in rels]
    rows = (
        await supabase.table("labels")
        .select("*")
        .in_("id", label_ids)
        .order("name")
        .execute()
    ).data
    return [LabelResponse(**r) for r in rows]


async def attach_label(
    supabase: AsyncClient, *, user_id: str, task_id: str, label_id: str
) -> None:
    task = (
        await supabase.table("tasks")
        .select("workspace_id")
        .eq("id", task_id)
        .single()
        .execute()
    ).data
    if not task:
        raise TaskNotFoundError(task_id)
    if not await _is_member(supabase, user_id=user_id, workspace_id=task["workspace_id"]):
        raise LabelPermissionError(task_id)
    # Verify label belongs to same workspace
    label = (
        await supabase.table("labels")
        .select("workspace_id")
        .eq("id", label_id)
        .single()
        .execute()
    ).data
    if not label or label["workspace_id"] != task["workspace_id"]:
        raise LabelNotFoundError(label_id)
    try:
        await supabase.table("task_labels").insert({
            "task_id": task_id,
            "label_id": label_id,
        }).execute()
    except APIError as exc:
        if exc.code == "23505":
            # Already attached; idempotent.
            return
        raise


async def detach_label(
    supabase: AsyncClient, *, user_id: str, task_id: str, label_id: str
) -> None:
    task = (
        await supabase.table("tasks")
        .select("workspace_id")
        .eq("id", task_id)
        .single()
        .execute()
    ).data
    if not task:
        raise TaskNotFoundError(task_id)
    if not await _is_member(supabase, user_id=user_id, workspace_id=task["workspace_id"]):
        raise LabelPermissionError(task_id)
    await (
        supabase.table("task_labels")
        .delete()
        .eq("task_id", task_id)
        .eq("label_id", label_id)
        .execute()
    )
