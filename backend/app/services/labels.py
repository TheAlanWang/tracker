"""Label business logic. Workspace-scoped + per-issue attach/detach."""

from postgrest.exceptions import APIError
from supabase import Client

from app.schemas.label import LabelCreate, LabelResponse


class LabelError(Exception):
    pass


class LabelNotFoundError(LabelError):
    pass


class LabelPermissionError(LabelError):
    pass


class LabelNameExistsError(LabelError):
    pass


class IssueNotFoundError(LabelError):
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


def list_labels(
    supabase: Client, *, user_id: str, workspace_id: str
) -> list[LabelResponse]:
    if not _is_member(supabase, user_id=user_id, workspace_id=workspace_id):
        raise LabelPermissionError(workspace_id)
    rows = (
        supabase.table("labels")
        .select("*")
        .eq("workspace_id", workspace_id)
        .order("name")
        .execute()
        .data
    )
    return [LabelResponse(**r) for r in rows]


def create_label(
    supabase: Client, *, user_id: str, workspace_id: str, payload: LabelCreate
) -> LabelResponse:
    if not _is_member(supabase, user_id=user_id, workspace_id=workspace_id):
        raise LabelPermissionError(workspace_id)
    try:
        row = (
            supabase.table("labels")
            .insert({
                "workspace_id": workspace_id,
                "name": payload.name,
                "color": payload.color,
            })
            .execute()
            .data[0]
        )
    except APIError as exc:
        if exc.code == "23505":
            raise LabelNameExistsError(payload.name) from exc
        raise
    return LabelResponse(**row)


def delete_label(supabase: Client, *, user_id: str, label_id: str) -> None:
    row = (
        supabase.table("labels")
        .select("workspace_id")
        .eq("id", label_id)
        .single()
        .execute()
        .data
    )
    if not row:
        raise LabelNotFoundError(label_id)
    if not _is_member(supabase, user_id=user_id, workspace_id=row["workspace_id"]):
        raise LabelPermissionError(label_id)
    supabase.table("labels").delete().eq("id", label_id).execute()


def list_issue_labels(
    supabase: Client, *, user_id: str, issue_id: str
) -> list[LabelResponse]:
    issue = (
        supabase.table("issues")
        .select("workspace_id")
        .eq("id", issue_id)
        .single()
        .execute()
        .data
    )
    if not issue:
        raise IssueNotFoundError(issue_id)
    if not _is_member(supabase, user_id=user_id, workspace_id=issue["workspace_id"]):
        raise LabelPermissionError(issue_id)
    # Two-query approach: get label_ids via join table, then fetch labels
    rels = (
        supabase.table("issue_labels")
        .select("label_id")
        .eq("issue_id", issue_id)
        .execute()
        .data
    )
    if not rels:
        return []
    label_ids = [r["label_id"] for r in rels]
    rows = (
        supabase.table("labels")
        .select("*")
        .in_("id", label_ids)
        .order("name")
        .execute()
        .data
    )
    return [LabelResponse(**r) for r in rows]


def attach_label(
    supabase: Client, *, user_id: str, issue_id: str, label_id: str
) -> None:
    issue = (
        supabase.table("issues")
        .select("workspace_id")
        .eq("id", issue_id)
        .single()
        .execute()
        .data
    )
    if not issue:
        raise IssueNotFoundError(issue_id)
    if not _is_member(supabase, user_id=user_id, workspace_id=issue["workspace_id"]):
        raise LabelPermissionError(issue_id)
    # Verify label belongs to same workspace
    label = (
        supabase.table("labels")
        .select("workspace_id")
        .eq("id", label_id)
        .single()
        .execute()
        .data
    )
    if not label or label["workspace_id"] != issue["workspace_id"]:
        raise LabelNotFoundError(label_id)
    try:
        supabase.table("issue_labels").insert({
            "issue_id": issue_id,
            "label_id": label_id,
        }).execute()
    except APIError as exc:
        if exc.code == "23505":
            # Already attached; idempotent.
            return
        raise


def detach_label(
    supabase: Client, *, user_id: str, issue_id: str, label_id: str
) -> None:
    issue = (
        supabase.table("issues")
        .select("workspace_id")
        .eq("id", issue_id)
        .single()
        .execute()
        .data
    )
    if not issue:
        raise IssueNotFoundError(issue_id)
    if not _is_member(supabase, user_id=user_id, workspace_id=issue["workspace_id"]):
        raise LabelPermissionError(issue_id)
    (
        supabase.table("issue_labels")
        .delete()
        .eq("issue_id", issue_id)
        .eq("label_id", label_id)
        .execute()
    )
