"""Search service — cross-entity ilike search within a workspace."""

import asyncio

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
    base = f"/w/{ws_slug}" if ws_slug else ""

    async def _search_projects() -> list[SearchResult]:
        rows = (
            await supabase.table("projects")
            .select("id, name, key")
            .eq("workspace_id", workspace_id)
            .or_(f"name.ilike.%{q}%,key.ilike.%{q}%")
            .limit(5)
            .execute()
        ).data
        return [
            SearchResult(
                type="project",
                id=r["id"],
                label=r["name"],
                sublabel=r["key"],
                href=f"{base}/p/{r['key']}/list",
            )
            for r in rows
        ]

    async def _search_tasks() -> list[SearchResult]:
        rows = (
            await supabase.table("tasks")
            .select("id, identifier, title, project_id")
            .eq("workspace_id", workspace_id)
            .or_(f"identifier.ilike.%{q}%,title.ilike.%{q}%")
            .limit(10)
            .execute()
        ).data
        # Collect unique project IDs to look up project keys for hrefs
        project_ids = list({r["project_id"] for r in rows})
        project_key_map: dict[str, str] = {}
        if project_ids:
            proj_rows = (
                await supabase.table("projects")
                .select("id, key")
                .in_("id", project_ids)
                .execute()
            ).data
            project_key_map = {p["id"]: p["key"] for p in proj_rows}

        results = []
        for r in rows:
            proj_key = project_key_map.get(r["project_id"], "")
            identifier = r["identifier"]
            results.append(
                SearchResult(
                    type="task",
                    id=r["id"],
                    label=r["title"],
                    sublabel=identifier,
                    href=f"{base}/p/{proj_key}/tasks/{identifier}",
                )
            )
        return results

    async def _search_labels() -> list[SearchResult]:
        rows = (
            await supabase.table("labels")
            .select("id, name")
            .eq("workspace_id", workspace_id)
            .ilike("name", f"%{q}%")
            .limit(5)
            .execute()
        ).data
        return [
            SearchResult(
                type="label",
                id=r["id"],
                label=r["name"],
                sublabel=None,
                href=f"{base}",
            )
            for r in rows
        ]

    # Concurrent fan-out via asyncio.gather — replaces the previous
    # ThreadPoolExecutor pattern. Event loop multiplexes the three HTTP
    # requests on one thread, no GIL contention.
    projects, tasks, labels = await asyncio.gather(
        _search_projects(), _search_tasks(), _search_labels()
    )
    return [*projects, *tasks, *labels]
