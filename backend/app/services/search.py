"""Search service — fuzzy, ranked, cross-entity search within a workspace.

Backed by the `search_workspace` Postgres RPC, which scores matches by trigram
similarity (typo-tolerant) plus a substring bonus and returns the most relevant
rows across projects / tasks / labels / goals / sprints. This service verifies
membership and turns each scored row into a navigable SearchResult.
"""

from supabase import AsyncClient

from app.schemas.search import SearchResult


class SearchPermissionError(Exception):
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


def _href(row: dict, base: str) -> str:
    """Build the navigation target for one scored search row."""
    rtype = row["type"]
    project_key = row.get("project_key") or ""
    if rtype == "project":
        return f"{base}/p/{row['sublabel']}/list"
    if rtype == "task":
        return f"{base}/p/{project_key}/tasks/{row['sublabel']}"
    if rtype == "goal":
        return f"{base}/goals"
    if rtype == "sprint":
        return f"{base}/p/{project_key}/sprints/{row['id']}"
    # label (and any future type): land on the workspace root.
    return f"{base}"


async def search(
    supabase: AsyncClient,
    *,
    user_id: str,
    query: str,
    workspace_id: str,
    ws_slug: str = "",
) -> list[SearchResult]:
    if not await _is_member(supabase, user_id=user_id, workspace_id=workspace_id):
        raise SearchPermissionError(workspace_id)

    q = query.strip()
    if not q:
        return []

    base = f"/w/{ws_slug}" if ws_slug else ""

    rows = (
        await supabase.rpc(
            "search_workspace", {"p_ws": workspace_id, "p_q": q}
        ).execute()
    ).data or []

    return [
        SearchResult(
            type=row["type"],
            id=row["id"],
            label=row["label"],
            sublabel=row.get("sublabel"),
            href=_href(row, base),
        )
        for row in rows
    ]
