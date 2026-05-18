"""Goal business logic.

Goals are a workspace-scoped recursive hierarchy. Each goal can have
sub-goals (parent_goal_id self-reference) and can have tasks attached
via tasks.goal_id. The list endpoint returns a flat array with computed
roll-up counts so the frontend can render the tree + progress bars in
one shot without N+1 queries.
"""

from supabase import AsyncClient

from app.schemas.goal import GoalCreate, GoalResponse, GoalUpdate


class GoalError(Exception):
    pass


class GoalNotFoundError(GoalError):
    pass


class GoalPermissionError(GoalError):
    pass


class WorkspaceNotFoundError(GoalError):
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


async def _fetch_goal(supabase: AsyncClient, goal_id: str) -> dict | None:
    return (
        await supabase.table("goals")
        .select("*")
        .eq("id", goal_id)
        .single()
        .execute()
    ).data


async def _ensure_member_via_goal(supabase: AsyncClient, user_id: str, goal_id: str) -> dict:
    goal = await _fetch_goal(supabase, goal_id)
    if not goal:
        raise GoalNotFoundError(goal_id)
    if not await _is_member(supabase, user_id=user_id, workspace_id=goal["workspace_id"]):
        raise GoalPermissionError(goal_id)
    return goal


def _compute_counts(
    goals: list[dict], tasks: list[dict]
) -> dict[str, tuple[int, int, int]]:
    """For each goal id, return (direct_task_count, descendant_task_count,
    done_task_count). Done_task_count is the descendant count of done tasks.
    Single pass through the goal tree + tasks; O(N) for N goals + tasks."""
    children: dict[str | None, list[str]] = {}
    for g in goals:
        children.setdefault(g["parent_goal_id"], []).append(g["id"])
    tasks_by_goal: dict[str, list[dict]] = {}
    for t in tasks:
        gid = t.get("goal_id")
        if gid is None:
            continue
        tasks_by_goal.setdefault(gid, []).append(t)

    descendant_total: dict[str, int] = {}
    descendant_done: dict[str, int] = {}
    direct_total: dict[str, int] = {}

    def walk(goal_id: str) -> tuple[int, int]:
        # Post-order: visit children, then add own direct tasks.
        total = 0
        done = 0
        for child_id in children.get(goal_id, []):
            ct, cd = walk(child_id)
            total += ct
            done += cd
        own = tasks_by_goal.get(goal_id, [])
        direct_total[goal_id] = len(own)
        total += len(own)
        done += sum(1 for t in own if t.get("status") == "done")
        descendant_total[goal_id] = total
        descendant_done[goal_id] = done
        return total, done

    for root_id in children.get(None, []):
        walk(root_id)

    return {
        g["id"]: (
            direct_total.get(g["id"], 0),
            descendant_total.get(g["id"], 0),
            descendant_done.get(g["id"], 0),
        )
        for g in goals
    }


async def list_goals(
    supabase: AsyncClient, *, user_id: str, workspace_id: str
) -> list[GoalResponse]:
    if not await _is_member(supabase, user_id=user_id, workspace_id=workspace_id):
        raise GoalPermissionError(workspace_id)
    goals = (
        await supabase.table("goals")
        .select("*")
        .eq("workspace_id", workspace_id)
        .order("position")
        .execute()
    ).data
    if not goals:
        return []
    # Fetch all tasks in workspace that have a goal_id — used only for counts
    tasks = (
        await supabase.table("tasks")
        .select("id, goal_id, status")
        .eq("workspace_id", workspace_id)
        .not_.is_("goal_id", "null")
        .execute()
    ).data
    counts = _compute_counts(goals, tasks)
    result: list[GoalResponse] = []
    for g in goals:
        direct, total, done = counts.get(g["id"], (0, 0, 0))
        result.append(
            GoalResponse(
                **g,
                direct_task_count=direct,
                descendant_task_count=total,
                done_task_count=done,
            )
        )
    return result


async def get_goal(
    supabase: AsyncClient, *, user_id: str, goal_id: str
) -> GoalResponse:
    goal = await _ensure_member_via_goal(supabase, user_id, goal_id)
    return GoalResponse(**goal)


async def create_goal(
    supabase: AsyncClient,
    *,
    user_id: str,
    workspace_id: str,
    payload: GoalCreate,
) -> GoalResponse:
    if not await _is_member(supabase, user_id=user_id, workspace_id=workspace_id):
        raise GoalPermissionError(workspace_id)
    # If parent_goal_id provided, validate it lives in this workspace —
    # otherwise a caller could attach a goal under a parent in a different
    # workspace (data leak).
    if payload.parent_goal_id:
        parent = await _fetch_goal(supabase, payload.parent_goal_id)
        if not parent or parent["workspace_id"] != workspace_id:
            raise GoalNotFoundError(payload.parent_goal_id)
    data = payload.model_dump(exclude_none=True)
    data["workspace_id"] = workspace_id
    data["created_by"] = user_id
    row = (await supabase.table("goals").insert(data).execute()).data[0]
    return GoalResponse(**row)


async def update_goal(
    supabase: AsyncClient,
    *,
    user_id: str,
    goal_id: str,
    payload: GoalUpdate,
) -> GoalResponse:
    goal = await _ensure_member_via_goal(supabase, user_id, goal_id)
    updates = payload.model_dump(exclude_unset=True)
    if "parent_goal_id" in updates and updates["parent_goal_id"]:
        # Same cross-workspace check as create, plus prevent making a goal
        # its own ancestor (would create a cycle Postgres won't catch).
        new_parent_id = updates["parent_goal_id"]
        if new_parent_id == goal_id:
            raise GoalError("a goal cannot be its own parent")
        parent = await _fetch_goal(supabase, new_parent_id)
        if not parent or parent["workspace_id"] != goal["workspace_id"]:
            raise GoalNotFoundError(new_parent_id)
        # Walk up new_parent's chain to confirm goal_id isn't in it.
        cursor = parent
        while cursor and cursor.get("parent_goal_id"):
            if cursor["parent_goal_id"] == goal_id:
                raise GoalError("cycle detected")
            cursor = await _fetch_goal(supabase, cursor["parent_goal_id"])
    if not updates:
        return GoalResponse(**goal)
    updated = (
        await supabase.table("goals")
        .update(updates)
        .eq("id", goal_id)
        .execute()
    ).data[0]
    return GoalResponse(**updated)


async def delete_goal(
    supabase: AsyncClient, *, user_id: str, goal_id: str
) -> None:
    await _ensure_member_via_goal(supabase, user_id, goal_id)
    # FK cascade deletes the subtree; tasks.goal_id SET NULL via FK.
    await supabase.table("goals").delete().eq("id", goal_id).execute()
async def list_goal_tasks(
    supabase: AsyncClient,
    *,
    user_id: str,
    goal_id: str,
    recursive: bool = False,
) -> list[dict]:
    goal = await _ensure_member_via_goal(supabase, user_id, goal_id)
    workspace_id = goal["workspace_id"]
    if not recursive:
        rows = (
            await supabase.table("tasks")
            .select("*")
            .eq("goal_id", goal_id)
            .order("created_at", desc=True)
            .execute()
        ).data
        return rows
    # Recursive: collect the goal_id + all descendants client-side, then
    # one IN query. Avoids needing a recursive CTE for small trees.
    all_goals = (
        await supabase.table("goals")
        .select("id, parent_goal_id")
        .eq("workspace_id", workspace_id)
        .execute()
    ).data
    children_by_parent: dict[str | None, list[str]] = {}
    for g in all_goals:
        children_by_parent.setdefault(g["parent_goal_id"], []).append(g["id"])
    subtree: list[str] = [goal_id]
    queue = [goal_id]
    while queue:
        cur = queue.pop()
        for child in children_by_parent.get(cur, []):
            subtree.append(child)
            queue.append(child)
    rows = (
        await supabase.table("tasks")
        .select("*")
        .in_("goal_id", subtree)
        .order("created_at", desc=True)
        .execute()
    ).data
    return rows
