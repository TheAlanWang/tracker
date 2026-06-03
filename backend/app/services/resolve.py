"""Resolve task identifiers to their canonical workspace/project location.

Two resolvers, with deliberately different contracts:

- ``resolve_scoped`` takes ``(ws_slug, project_key, identifier)`` and walks each
  unique constraint exactly (workspace.slug is globally unique → project is
  unique per (workspace, key) → task is unique per (project, identifier)), so it
  resolves to exactly one task or 404. This is what the canonical in-app route
  ``/w/:wsSlug/p/:pKey/tasks/:identifier`` uses — no cross-workspace ambiguity.

- ``resolve_identifier`` takes a bare ``identifier`` and searches across all the
  user's workspaces. A bare identifier is *not* globally unique (two workspaces
  can each have a project keyed RAG with a task RAG-10), so this is inherently
  ambiguous. It is kept for the ``/browse`` shortlink and the MCP server, and is
  made deterministic + context-aware: an optional ``prefer_workspace`` slug hint
  wins, otherwise the oldest match is chosen (stable, never arbitrary).
"""

from fastapi import HTTPException, status
from pydantic import BaseModel
from supabase import AsyncClient


class ResolveResponse(BaseModel):
    workspace_slug: str
    project_key: str
    task_id: str
    identifier: str


async def _is_member(
    supabase: AsyncClient, *, user_id: str, workspace_id: str
) -> bool:
    rows = (
        await supabase.table("workspace_members")
        .select("role")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .execute()
    ).data
    return bool(rows)


async def resolve_scoped(
    supabase: AsyncClient,
    *,
    user_id: str,
    ws_slug: str,
    project_key: str,
    identifier: str,
) -> ResolveResponse:
    """Resolve a task from its full canonical location.

    404 on any miss — including non-membership, which we deliberately do not
    distinguish from "not found" so foreign-workspace existence isn't leaked.
    """
    # Project keys and identifiers are always stored uppercase; normalize so a
    # hand-typed lowercase URL still resolves. Slugs are case-sensitive.
    project_key = project_key.upper()
    identifier = identifier.upper()

    ws_rows = (
        await supabase.table("workspaces")
        .select("id, slug")
        .eq("slug", ws_slug)
        .limit(1)
        .execute()
    ).data
    if not ws_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    ws = ws_rows[0]

    if not await _is_member(supabase, user_id=user_id, workspace_id=ws["id"]):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    proj_rows = (
        await supabase.table("projects")
        .select("id, key")
        .eq("workspace_id", ws["id"])
        .eq("key", project_key)
        .limit(1)
        .execute()
    ).data
    if not proj_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    proj = proj_rows[0]

    task_rows = (
        await supabase.table("tasks")
        .select("id, identifier")
        .eq("project_id", proj["id"])
        .eq("identifier", identifier)
        .limit(1)
        .execute()
    ).data
    if not task_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    task = task_rows[0]

    return ResolveResponse(
        workspace_slug=ws["slug"],
        project_key=proj["key"],
        task_id=task["id"],
        identifier=task["identifier"],
    )


async def resolve_identifier(
    supabase: AsyncClient,
    *,
    user_id: str,
    identifier: str,
    prefer_workspace: str | None = None,
) -> ResolveResponse:
    """Resolve a bare identifier across the user's workspaces (ambiguous).

    Used by the ``/browse`` shortlink and MCP, where the workspace/project isn't
    known up front. When multiple tasks match (a cross-workspace collision), a
    ``prefer_workspace`` slug hint wins; otherwise the oldest match is returned.
    """
    member_rows = (
        await supabase.table("workspace_members")
        .select("workspace_id")
        .eq("user_id", user_id)
        .execute()
    ).data
    if not member_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    ws_ids = [r["workspace_id"] for r in member_rows]

    # Fetch all matches (not .limit(1)) ordered deterministically so the choice
    # below is stable instead of depending on heap order.
    task_rows = (
        await supabase.table("tasks")
        .select("id, identifier, workspace_id, project_id")
        .eq("identifier", identifier)
        .in_("workspace_id", ws_ids)
        .order("created_at")
        .execute()
    ).data
    if not task_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    chosen = None
    if prefer_workspace:
        pref_rows = (
            await supabase.table("workspaces")
            .select("id")
            .eq("slug", prefer_workspace)
            .limit(1)
            .execute()
        ).data
        # Only honor the hint for a workspace the user actually belongs to.
        if pref_rows and pref_rows[0]["id"] in ws_ids:
            pref_id = pref_rows[0]["id"]
            chosen = next(
                (t for t in task_rows if t["workspace_id"] == pref_id), None
            )
    if chosen is None:
        chosen = task_rows[0]
    task = chosen

    ws_row = (
        await supabase.table("workspaces")
        .select("slug")
        .eq("id", task["workspace_id"])
        .single()
        .execute()
    ).data
    if not ws_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    proj_row = (
        await supabase.table("projects")
        .select("key")
        .eq("id", task["project_id"])
        .single()
        .execute()
    ).data
    if not proj_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    return ResolveResponse(
        workspace_slug=ws_row["slug"],
        project_key=proj_row["key"],
        task_id=task["id"],
        identifier=task["identifier"],
    )
