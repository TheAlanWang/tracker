"""Search service — cross-entity ilike search within a workspace."""

from concurrent.futures import ThreadPoolExecutor, as_completed

from supabase import Client

from app.schemas.search import SearchResult


class SearchPermissionError(Exception):
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


def search(
    supabase: Client,
    *,
    user_id: str,
    query: str,
    workspace_id: str,
    ws_slug: str = "",
) -> list[SearchResult]:
    if not _is_member(supabase, user_id=user_id, workspace_id=workspace_id):
        raise SearchPermissionError(workspace_id)

    q = query.strip()
    base = f"/w/{ws_slug}" if ws_slug else ""

    def _search_projects() -> list[SearchResult]:
        rows = (
            supabase.table("projects")
            .select("id, name, key")
            .eq("workspace_id", workspace_id)
            .or_(f"name.ilike.%{q}%,key.ilike.%{q}%")
            .limit(5)
            .execute()
            .data
        )
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

    def _search_tasks() -> list[SearchResult]:
        rows = (
            supabase.table("tasks")
            .select("id, identifier, title, project_id")
            .eq("workspace_id", workspace_id)
            .or_(f"identifier.ilike.%{q}%,title.ilike.%{q}%")
            .limit(10)
            .execute()
            .data
        )
        # Collect unique project IDs to look up project keys for hrefs
        project_ids = list({r["project_id"] for r in rows})
        project_key_map: dict[str, str] = {}
        if project_ids:
            proj_rows = (
                supabase.table("projects")
                .select("id, key")
                .in_("id", project_ids)
                .execute()
                .data
            )
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

    def _search_labels() -> list[SearchResult]:
        rows = (
            supabase.table("labels")
            .select("id, name")
            .eq("workspace_id", workspace_id)
            .ilike("name", f"%{q}%")
            .limit(5)
            .execute()
            .data
        )
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

    buckets: dict[str, list[SearchResult]] = {}
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {
            pool.submit(_search_projects): "projects",
            pool.submit(_search_tasks): "tasks",
            pool.submit(_search_labels): "labels",
        }
        for future in as_completed(futures):
            key = futures[future]
            buckets[key] = future.result()

    results: list[SearchResult] = []
    results += buckets.get("projects", [])
    results += buckets.get("tasks", [])
    results += buckets.get("labels", [])
    return results
