"""Trackly MCP server — tools that wrap the Trackly REST API.

Tool docstrings double as LLM hints — clients pick which tool to call
by matching the user's intent against these descriptions. Write them
for an LLM reader, not a human one: lead with the verb, name the
concept the user would say, mention input shapes.

Run (v2, hosted):
    uv run trackly-mcp           # boots uvicorn + streamable HTTP on /mcp

Auth is per-request: clients connect via OAuth (see README) and the
verified Supabase bearer is forwarded to the backend. The caller's user
id comes from the request context (set by AuthMiddleware), not env. See
config.py for the required server env vars.
"""

import os
from typing import Any, Literal

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

from .client import (
    TracklyError,
    get_client,
    resolve_project_identifier,
    resolve_project_key,
    resolve_task_identifier,
    resolve_workspace,
)

# FastMCP's `settings.host` defaults to 127.0.0.1, which makes it auto-enable
# DNS-rebinding protection that only allows a localhost Host header. Behind Fly
# our Host is `trackly-mcp.fly.dev`, so that check returns 421 "Invalid Host
# header". DNS-rebinding protection exists to stop malicious web pages from
# reaching a *localhost-bound* MCP server; this is a public, OAuth-Bearer-gated
# service, so the bearer token is the security boundary and the Host check is
# both inapplicable and harmful. Disable it explicitly.
mcp = FastMCP(
    "trackly",
    # Stateless: each HTTP request is processed inline, in a task derived from
    # that request's context. This is REQUIRED for our auth model — the
    # AuthMiddleware stashes the caller's bearer in a contextvar and the tools
    # read it via get_bearer(). In stateful mode the tool runs in the session
    # manager's long-lived task group (spawned at startup), which never sees
    # the per-request contextvar → get_bearer() LookupError on every tool call.
    # Stateless also fits a pure request/response tool server (no server push).
    stateless_http=True,
    # FastMCP's settings.host defaults to 127.0.0.1, which auto-enables
    # DNS-rebinding protection that only allows a localhost Host header — behind
    # Fly our Host is trackly-mcp.fly.dev, so /mcp returned 421 "Invalid Host
    # header" after auth passed. That guard is for localhost-bound servers; this
    # is a public OAuth-Bearer-gated service, so disable it.
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=False,
    ),
)

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
    from .context import get_user_id
    params: dict[str, Any] = {"assignee_id": get_user_id()}
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


@mcp.tool()
async def list_sprints(project_key_or_id: str) -> list[dict[str, Any]]:
    """List all sprints in a project, with status (planned / active /
    completed) and date range. Sprints live under a project, not under
    a workspace — pass the project key (e.g. 'FRO') or UUID. Use when
    the user says 'what sprint is active in FRO', 'show all sprints',
    or implicitly before `move_to_sprint` when the user references
    'the current sprint' but doesn't supply a UUID. Returns sprint id,
    name, status, start_date, end_date."""
    client = get_client()
    project = await resolve_project_identifier(project_key_or_id)
    return await client.get(f"/projects/{project['id']}/sprints")


@mcp.tool()
async def list_tasks(
    workspace_slug: str,
    project_key: str | None = None,
    status: Literal[
        "backlog", "todo", "in_progress", "in_review", "done", "cancelled"
    ]
    | None = None,
    assignee_id: str | None = None,
) -> list[dict[str, Any]]:
    """List tasks in a workspace, optionally narrowed. Differs from
    list_my_tasks in that it returns tasks regardless of assignee
    (`list_my_tasks` always filters to the current user).

    Use when the user says 'show all tasks in FRO', 'unassigned tasks',
    'tasks in_progress across the workspace', or any query that isn't
    'my tasks'. Pass `project_key` to scope to one project, `status`
    to filter by column, `assignee_id` to filter by assignee. Pass the
    literal string "me" as `assignee_id` for the current user."""
    client = get_client()
    ws = await resolve_workspace(workspace_slug)

    if assignee_id == "me":
        from .context import get_user_id
        assignee_id = get_user_id()

    if project_key:
        # Project-scoped endpoint supports `status` natively; we do
        # assignee filtering client-side after fetch.
        project = await resolve_project_key(ws["id"], project_key)
        params: dict[str, Any] = {}
        if status:
            params["status"] = status
        tasks = await client.get(
            f"/projects/{project['id']}/tasks", params=params
        )
        if assignee_id is not None:
            tasks = [t for t in tasks if t.get("assignee_id") == assignee_id]
        return tasks

    # Workspace-scoped endpoint supports `assignee_id` natively; status
    # filter is client-side.
    params = {}
    if assignee_id is not None:
        params["assignee_id"] = assignee_id
    tasks = await client.get(f"/workspaces/{ws['id']}/tasks", params=params)
    if status:
        tasks = [t for t in tasks if t.get("status") == status]
    return tasks


@mcp.tool()
async def list_workspace_members(workspace_slug: str) -> list[dict[str, Any]]:
    """List the members of a workspace — each member's user_id,
    display_name, email, avatar_url, and role. Use when the user says
    'who's in this workspace', or — more importantly — implicitly
    BEFORE `assign_task` when they reference a teammate by name
    ('assign FE-23 to Sarah'). Map the name → user_id, then call
    assign_task with that user_id."""
    client = get_client()
    ws = await resolve_workspace(workspace_slug)
    return await client.get(f"/workspaces/{ws['id']}/members")


@mcp.tool()
async def list_recent_activity(
    since: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Recent task changes authored by the current user — what status
    changes, priority bumps, assignee swaps, comments etc. you've done
    across all your workspaces. Each entry includes `task_identifier`
    (e.g. 'TRAC-23') so you can reference tasks by their human handle.

    Use when the user says 'what did I do yesterday', 'morning standup',
    'recent activity', 'what changed since Monday'. `since` is an ISO
    8601 datetime (e.g. '2026-05-21T00:00:00Z'); convert relative dates
    ('yesterday') to absolute before calling. `limit` 1-200 (default
    50). Results are ordered newest-first."""
    client = get_client()
    params: dict[str, Any] = {"limit": limit}
    if since:
        params["since"] = since
    return await client.get("/me/activity", params=params)


@mcp.tool()
async def get_project(project_key_or_id: str) -> dict[str, Any]:
    """Get full details for a single project — description, color, and
    `environments` (the list of production / staging / repo / docs URLs
    attached to the project). Use when the user says 'what's the prod
    URL for FRO', 'show me the repo for project X', 'what's project X's
    description'. Accepts a project key (e.g. 'FRO') or a UUID. The
    returned `environments` array has one entry per link, each with
    {name, url, type} — filter by `type` ('production' / 'staging' /
    'repo' / 'docs' / 'design' / 'other') to answer URL questions."""
    project = await resolve_project_identifier(project_key_or_id)
    return project


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
async def update_task_title(
    task_identifier: str,
    title: str,
) -> dict[str, Any]:
    """Rename a task. Use when the user says 'rename TRAC-7 to ...',
    'update title of FE-12 to ...', 'change TRAC-7's name'. Returns
    the updated task."""
    client = get_client()
    resolved = await resolve_task_identifier(task_identifier)
    return await client.patch(
        f"/tasks/{resolved['task_id']}",
        json={"title": title},
    )


@mcp.tool()
async def update_task_description(
    task_identifier: str,
    description: str | None,
) -> dict[str, Any]:
    """Replace a task's description (markdown body). Pass null/empty to
    clear. Use when the user says 'update TRAC-7's description with ...',
    'replace the body of FE-12 with ...'. To APPEND rather than replace,
    first call `get_task` to read the current description, modify it,
    then call this tool with the combined body. Returns the updated task."""
    client = get_client()
    resolved = await resolve_task_identifier(task_identifier)
    return await client.patch(
        f"/tasks/{resolved['task_id']}",
        json={"description": description},
    )


@mcp.tool()
async def set_due_date(
    task_identifier: str,
    due_date: str | None,
) -> dict[str, Any]:
    """Set or clear a task's due date. Use when the user says 'push
    TRAC-7 to Friday', 'set due date on FE-12 to next Monday', 'clear
    the deadline on TRAC-7'. `due_date` must be an ISO 8601 calendar
    date (YYYY-MM-DD), or null to clear. The AI should convert relative
    dates ('Friday', 'next Monday') to absolute YYYY-MM-DD before
    calling. Returns the updated task."""
    client = get_client()
    resolved = await resolve_task_identifier(task_identifier)
    return await client.patch(
        f"/tasks/{resolved['task_id']}",
        json={"due_date": due_date},
    )


@mcp.tool()
async def set_priority(
    task_identifier: str,
    priority: Literal["urgent", "high", "medium", "low", "no_priority"],
) -> dict[str, Any]:
    """Set a task's priority. Use when the user says 'this is urgent',
    'bump TRAC-7 to high', 'lower priority of FE-12', 'clear priority
    on TRAC-7' (→ 'no_priority'). Returns the updated task."""
    client = get_client()
    resolved = await resolve_task_identifier(task_identifier)
    return await client.patch(
        f"/tasks/{resolved['task_id']}",
        json={"priority": priority},
    )


@mcp.tool()
async def assign_task(
    task_identifier: str,
    assignee_id: str | None,
) -> dict[str, Any]:
    """Assign a task to a user, or clear the assignee. Use when the user
    says 'assign TRAC-7 to me', 'unassign FE-12', 'give TRAC-7 to <uuid>'.
    Pass the literal string "me" as a shortcut for the current user
    (resolved from the authenticated request context) — saves Claude an
    extra lookup. Pass null to unassign. Returns the updated task."""
    client = get_client()
    resolved = await resolve_task_identifier(task_identifier)
    if assignee_id == "me":
        from .context import get_user_id
        assignee_id = get_user_id()
    return await client.patch(
        f"/tasks/{resolved['task_id']}",
        json={"assignee_id": assignee_id},
    )


@mcp.tool()
async def move_to_sprint(
    task_identifier: str,
    sprint_id: str | None,
) -> dict[str, Any]:
    """Add a task to a sprint, or pull it out. Use when the user says
    'add TRAC-7 to the active sprint', 'move FE-12 to sprint <id>',
    'pull TRAC-7 out of the sprint'. If the user references 'active'
    or 'current' sprint without a UUID, call `list_sprints` first to
    find the one whose status is 'active'. Pass null to remove from
    sprint. Returns the updated task."""
    client = get_client()
    resolved = await resolve_task_identifier(task_identifier)
    return await client.patch(
        f"/tasks/{resolved['task_id']}",
        json={"sprint_id": sprint_id},
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
    """Entry point — boot the streamable-HTTP MCP server.

    v1 had a stdio mode here; v2 is HTTP-only (see spec security invariants).
    Anyone wanting to use trackly-mcp connects via OAuth to the hosted URL.
    """
    import uvicorn

    from .app import create_app

    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8080"))
    uvicorn.run(create_app(), host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()


# Surface TracklyError as a known exception so test code can import it
# alongside the server, without reaching into client internals.
__all__ = ["mcp", "main", "TracklyError"]
