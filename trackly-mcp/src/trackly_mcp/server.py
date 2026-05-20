"""Trackly MCP server — tools that wrap the Trackly REST API.

Tool docstrings double as LLM hints — clients pick which tool to call
by matching the user's intent against these descriptions. Write them
for an LLM reader, not a human one: lead with the verb, name the
concept the user would say, mention input shapes.

Run:
    uv run trackly-mcp           # stdio transport (default)

Requires env:
    TRACKLY_USER_ID       — UUID of your Trackly account (auth.users.id)
    TRACKLY_JWT_SECRET    — same as backend SUPABASE_JWT_SECRET
    TRACKLY_API_URL       — optional; defaults to prod
"""

from typing import Any, Literal

from mcp.server.fastmcp import FastMCP

from .client import (
    TracklyError,
    get_client,
    resolve_project_key,
    resolve_task_identifier,
    resolve_workspace,
)

mcp = FastMCP("trackly")

# ─── Read tools ─────────────────────────────────────────────────────


@mcp.tool()
async def list_workspaces() -> list[dict[str, Any]]:
    """List every workspace the current user is a member of. Returns
    each workspace's id, slug, and name. Useful as a first step when
    the user mentions a workspace by name and you need to map it to
    an id / slug for downstream tools."""
    client = get_client()
    return await client.get("/workspaces")


@mcp.tool()
async def list_projects(workspace_slug: str) -> list[dict[str, Any]]:
    """List the projects inside a workspace. Returns each project's
    id, key (the uppercase prefix shown in task identifiers — e.g.
    'TRAC' in 'TRAC-7'), name, and description. `workspace_slug` is
    the URL-friendly handle shown in tracker.thealanwang.xyz/w/<slug>."""
    client = get_client()
    ws = await resolve_workspace(workspace_slug)
    return await client.get(f"/workspaces/{ws['id']}/projects")


@mcp.tool()
async def list_my_tasks(
    workspace_slug: str,
    status: Literal[
        "backlog", "todo", "in_progress", "in_review", "done", "cancelled"
    ]
    | None = None,
) -> list[dict[str, Any]]:
    """List the tasks assigned to the current user in a workspace.
    Use when the user says 'what's on my plate', 'show my tasks',
    'what am I working on'. Filter by `status` (e.g. 'in_progress')
    if they ask about a specific column. Returns task id, identifier,
    title, status, priority, due_date, project_id, updated_at."""
    client = get_client()
    ws = await resolve_workspace(workspace_slug)
    params: dict[str, Any] = {"assignee_id": client.user_id}
    tasks = await client.get(
        f"/workspaces/{ws['id']}/tasks", params=params
    )
    if status:
        tasks = [t for t in tasks if t["status"] == status]
    return tasks


@mcp.tool()
async def get_task(task_identifier: str) -> dict[str, Any]:
    """Fetch full details for a task by its human identifier (e.g.
    'TRAC-7'). Returns the task plus its recent comments. Use when
    the user says 'show me TRAC-7' or wants to know what a specific
    task is about before doing something with it."""
    client = get_client()
    resolved = await resolve_task_identifier(task_identifier)
    task = await client.get(f"/tasks/{resolved['task_id']}")
    comments = await client.get(f"/tasks/{resolved['task_id']}/comments")
    return {
        **task,
        "comments": comments,
        "url": f"https://tracker.thealanwang.xyz/browse/{task_identifier}",
    }


@mcp.tool()
async def search(workspace_slug: str, query: str) -> list[dict[str, Any]]:
    """Search tasks, projects, and labels in a workspace by name.
    Substring match — passing 'auth' finds 'Auth: refresh token rotation',
    'Audit log', etc. Use when the user says 'find ...', 'search for ...',
    or names a task they can't remember the identifier of. Returns up
    to 20 results, each with type / id / label / href."""
    client = get_client()
    ws = await resolve_workspace(workspace_slug)
    return await client.get(
        "/search",
        params={"q": query, "ws_id": ws["id"], "ws_slug": ws["slug"]},
    )


# ─── Write tools ────────────────────────────────────────────────────


@mcp.tool()
async def create_task(
    workspace_slug: str,
    project_key: str,
    title: str,
    description: str | None = None,
    priority: Literal["low", "medium", "high", "urgent"] = "medium",
) -> dict[str, Any]:
    """Create a new task in a Trackly project. Use this when the user
    wants to capture work — 'add a task', 'log this bug', 'remember
    to do X', 'create a ticket for ...'. `project_key` is the uppercase
    code shown in task identifiers (the 'TRAC' in 'TRAC-7'). New
    tasks land in the project's backlog by default. Returns the new
    task with its identifier (e.g. 'TRAC-12') and a deep-link URL."""
    client = get_client()
    ws = await resolve_workspace(workspace_slug)
    project = await resolve_project_key(ws["id"], project_key)
    payload = {"title": title, "priority": priority}
    if description:
        payload["description"] = description
    task = await client.post(f"/projects/{project['id']}/tasks", json=payload)
    return {
        **task,
        "url": f"https://tracker.thealanwang.xyz/browse/{task['identifier']}",
    }


@mcp.tool()
async def update_task_status(
    task_identifier: str,
    status: Literal[
        "backlog", "todo", "in_progress", "in_review", "done", "cancelled"
    ],
) -> dict[str, Any]:
    """Change a task's status. Use when the user says 'move TRAC-7 to
    in progress', 'mark TRAC-7 done', 'this is in review now'. Returns
    the updated task. Server enforces workspace membership."""
    client = get_client()
    resolved = await resolve_task_identifier(task_identifier)
    return await client.patch(
        f"/tasks/{resolved['task_id']}",
        json={"status": status},
    )


@mcp.tool()
async def add_comment(task_identifier: str, body: str) -> dict[str, Any]:
    """Post a comment on a task. Markdown is rendered. Use when the
    user says 'comment on TRAC-7 with ...', 'add a note to ...', or
    when reporting back about work done on a task. Returns the new
    comment row."""
    client = get_client()
    resolved = await resolve_task_identifier(task_identifier)
    return await client.post(
        f"/tasks/{resolved['task_id']}/comments",
        json={"body": body},
    )


def main() -> None:
    """Entry point referenced by `pyproject.toml [project.scripts]`."""
    # stdio transport — what Claude Code / Cursor / Claude Desktop
    # all use for local MCP servers. No HTTP server, no port to bind.
    mcp.run()


if __name__ == "__main__":
    main()


# Surface TracklyError as a known exception so test code can import it
# alongside the server, without reaching into client internals.
__all__ = ["mcp", "main", "TracklyError"]
