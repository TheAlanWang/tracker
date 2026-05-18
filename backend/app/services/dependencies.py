"""Task dependency business logic.

A dependency is a directed edge "blocker → blocked" between two tasks
in the same workspace. The service enforces:

  - Both tasks exist and live in the same workspace
  - The user is a member of that workspace
  - No self-references (also enforced by DB check)
  - No duplicates (also enforced by DB unique constraint)
  - No cycles — walking from `blocked_task_id` along the chain of its
    own blockers must not reach `blocker_task_id`

Cycle detection is O(N) over the dependency graph and runs in Python
rather than SQL because the graphs are small (a handful of edges per
workspace) and producing a friendly HTTP error reads better than a DB
constraint violation.
"""

from supabase import AsyncClient

from app.schemas.dependency import (
    DependencyLink,
    DependencyResponse,
    TaskDependencies,
)
from app.schemas.task import TaskResponse


class DependencyError(Exception):
    pass


class DependencyNotFoundError(DependencyError):
    pass


class DependencyPermissionError(DependencyError):
    pass


class TaskNotFoundError(DependencyError):
    pass


class CrossWorkspaceError(DependencyError):
    """Caller tried to link two tasks from different workspaces."""


class CycleError(DependencyError):
    """Caller tried to create a dependency that would form a cycle."""


class DuplicateError(DependencyError):
    """Caller tried to insert a (blocker, blocked) pair that already exists."""


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


async def list_dependencies(
    supabase: AsyncClient, *, user_id: str, task_id: str
) -> TaskDependencies:
    task = await _fetch_task(supabase, task_id)
    if not task:
        raise TaskNotFoundError(task_id)
    if not await _is_member(supabase, user_id=user_id, workspace_id=task["workspace_id"]):
        raise DependencyPermissionError(task_id)

    # Each row gives us both the dependency_id (for DELETE) and the
    # task id on the other side. Two queries — one per direction —
    # because the "other side" is a different FK in each case.
    blocker_rows = (
        await supabase.table("task_dependencies")
        .select("id, blocker_task_id")
        .eq("blocked_task_id", task_id)
        .execute()
    ).data
    blocking_rows = (
        await supabase.table("task_dependencies")
        .select("id, blocked_task_id")
        .eq("blocker_task_id", task_id)
        .execute()
    ).data

    all_task_ids = [r["blocker_task_id"] for r in blocker_rows] + [
        r["blocked_task_id"] for r in blocking_rows
    ]
    tasks_by_id: dict[str, TaskResponse] = {}
    if all_task_ids:
        rows = (
            await supabase.table("tasks")
            .select("*")
            .in_("id", all_task_ids)
            .execute()
        ).data
        for r in rows:
            tasks_by_id[r["id"]] = TaskResponse(**r)

    def link(row: dict, key: str) -> DependencyLink | None:
        t = tasks_by_id.get(row[key])
        if not t:
            return None
        return DependencyLink(dependency_id=row["id"], task=t)

    blockers = [
        link
        for link in (link(r, "blocker_task_id") for r in blocker_rows)
        if link is not None
    ]
    blocking = [
        link
        for link in (link(r, "blocked_task_id") for r in blocking_rows)
        if link is not None
    ]
    return TaskDependencies(blockers=blockers, blocking=blocking)


async def list_blocked_task_ids(
    supabase: AsyncClient, *, user_id: str, workspace_id: str
) -> list[str]:
    """Return task ids in the workspace that have at least one OPEN blocker
    (a blocker whose status is not done/cancelled). Used by the Board and
    list views to render a "🔒 Blocked" badge without per-task lookups."""
    if not await _is_member(supabase, user_id=user_id, workspace_id=workspace_id):
        raise DependencyPermissionError(workspace_id)

    # Pull every dep in this workspace (filter via the blocker task's
    # workspace_id — both ends are in the same workspace by invariant).
    # Fetch blocker.status in the same query so we can filter client-side.
    rows = (
        await supabase.table("task_dependencies")
        .select("blocked_task_id, blocker:tasks!blocker_task_id(workspace_id,status)")
        .execute()
    ).data
    blocked: set[str] = set()
    for r in rows:
        blocker = r.get("blocker") or {}
        if blocker.get("workspace_id") != workspace_id:
            continue
        if blocker.get("status") not in ("done", "cancelled"):
            blocked.add(r["blocked_task_id"])
    return sorted(blocked)


async def _would_create_cycle(
    supabase: AsyncClient, *, blocker_id: str, blocked_id: str
) -> bool:
    """Check if adding (blocker → blocked) would create a cycle.

    Walk forward from `blocked_id` along its outgoing edges (what it
    blocks). If that walk reaches `blocker_id`, there's already a path
    from blocked back to blocker — adding our edge would close the loop.
    BFS, marking visited to terminate on degenerate cycles.
    """
    visited: set[str] = set()
    queue: list[str] = [blocked_id]
    while queue:
        cur = queue.pop()
        if cur in visited:
            continue
        visited.add(cur)
        if cur == blocker_id:
            return True
        rows = (
            await supabase.table("task_dependencies")
            .select("blocked_task_id")
            .eq("blocker_task_id", cur)
            .execute()
        ).data
        for r in rows:
            queue.append(r["blocked_task_id"])
    return False


async def create_dependency(
    supabase: AsyncClient,
    *,
    user_id: str,
    blocker_task_id: str,
    blocked_task_id: str,
) -> DependencyResponse:
    if blocker_task_id == blocked_task_id:
        raise DependencyError("A task cannot block itself")

    blocker = await _fetch_task(supabase, blocker_task_id)
    blocked = await _fetch_task(supabase, blocked_task_id)
    if not blocker:
        raise TaskNotFoundError(blocker_task_id)
    if not blocked:
        raise TaskNotFoundError(blocked_task_id)
    if blocker["workspace_id"] != blocked["workspace_id"]:
        raise CrossWorkspaceError(
            "Tasks must live in the same workspace to link them"
        )
    if not await _is_member(
        supabase, user_id=user_id, workspace_id=blocker["workspace_id"]
    ):
        raise DependencyPermissionError(blocker_task_id)

    if await _would_create_cycle(
        supabase, blocker_id=blocker_task_id, blocked_id=blocked_task_id
    ):
        raise CycleError(
            "This would create a circular dependency between these tasks"
        )

    # Check for duplicate before the DB unique constraint fires — gives a
    # cleaner error path than catching a postgres APIError.
    existing = (
        await supabase.table("task_dependencies")
        .select("id")
        .eq("blocker_task_id", blocker_task_id)
        .eq("blocked_task_id", blocked_task_id)
        .execute()
    ).data
    if existing:
        raise DuplicateError("This dependency already exists")

    row = (
        await supabase.table("task_dependencies")
        .insert(
            {
                "blocker_task_id": blocker_task_id,
                "blocked_task_id": blocked_task_id,
                "created_by": user_id,
            }
        )
        .execute()
    ).data[0]
    return DependencyResponse(**row)


async def delete_dependency(
    supabase: AsyncClient, *, user_id: str, dependency_id: str
) -> None:
    row = (
        await supabase.table("task_dependencies")
        .select("*, blocker:tasks!blocker_task_id(workspace_id)")
        .eq("id", dependency_id)
        .single()
        .execute()
    ).data
    if not row:
        raise DependencyNotFoundError(dependency_id)
    workspace_id = row["blocker"]["workspace_id"]
    if not await _is_member(supabase, user_id=user_id, workspace_id=workspace_id):
        raise DependencyPermissionError(dependency_id)
    await supabase.table("task_dependencies").delete().eq(
        "id", dependency_id
    ).execute()
