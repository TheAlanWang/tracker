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

# Sentinel default for update_task's clearable fields. Lets us distinguish
# "argument omitted → leave unchanged" from "argument passed as null → clear":
# both look like None otherwise. Any caller value (a string or null) overrides it.
_UNSET = "__UNSET__"

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
    the URL-friendly handle shown in gettrackly.dev/w/<slug>."""
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
async def get_task(
    task_identifier: str, workspace_slug: str | None = None
) -> dict[str, Any]:
    """Fetch full details for a task by its human identifier (e.g.
    'TRAC-7'). Returns the task, its recent comments, and a `project`
    object carrying the parent project's context — its `description` and
    `environments` (production/staging URLs, repo, docs, design links, each
    tagged by `type`) — so you understand what the project is about and can
    grab the right link without a separate get_project call. Use when the
    user says 'show me TRAC-7' or wants to know what a specific task is
    about before doing something with it.

    Pass `workspace_slug` whenever you know which workspace the task is in
    (e.g. you got it from list_tasks): identifiers aren't unique across
    workspaces, so this pins the exact task. Omit it only for single-workspace
    users."""
    client = get_client()
    resolved = await resolve_task_identifier(task_identifier, workspace_slug)
    task = await client.get(f"/tasks/{resolved['task_id']}")
    comments = await client.get(f"/tasks/{resolved['task_id']}/comments")
    # Pull the parent project so the task carries its context inline. List
    # tools stay lean (no per-row project blob); this deep single-task view
    # is where the project's description + environment links are worth it.
    project = await client.get(f"/projects/{task['project_id']}")
    return {
        **task,
        "project": {
            "key": project.get("key"),
            "name": project.get("name"),
            "description": project.get("description"),
            "environments": project.get("environments", []),
        },
        "comments": comments,
        "url": f"{client.web_url}/browse/{task_identifier}",
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
    or implicitly before `update_task` (sprint_id) when the user references
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
    archived: bool = False,
) -> list[dict[str, Any]]:
    """List tasks in a workspace, optionally narrowed. Differs from
    list_my_tasks in that it returns tasks regardless of assignee
    (`list_my_tasks` always filters to the current user).

    Use when the user says 'show all tasks in FRO', 'unassigned tasks',
    'tasks in_progress across the workspace', or any query that isn't
    'my tasks'. Pass `project_key` to scope to one project, `status`
    to filter by column, `assignee_id` to filter by assignee. Pass the
    literal string "me" as `assignee_id` for the current user.

    Pass `archived=true` to list a project's ARCHIVED tasks instead of
    its active ones ('show the archive', 'what did we archive in FRO').
    Requires `project_key` — the archive is browsed per project."""
    if archived and not project_key:
        # Only the project-scoped endpoint has an archived filter; failing
        # loudly beats silently returning active tasks.
        raise TracklyError(
            "archived=true requires project_key — the archive is browsed "
            "per project. Pass the project key (e.g. 'FRO')."
        )

    client = get_client()
    ws = await resolve_workspace(workspace_slug)

    if assignee_id == "me":
        from .context import get_user_id
        assignee_id = get_user_id()

    if project_key:
        # Project-scoped endpoint supports `status` + `archived` natively;
        # we do assignee filtering client-side after fetch.
        project = await resolve_project_key(ws["id"], project_key)
        params: dict[str, Any] = {}
        if status:
            params["status"] = status
        if archived:
            params["archived"] = "true"
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
    BEFORE `update_task` when they reference a teammate by name
    ('assign FE-23 to Sarah'). Map the name → user_id, then call
    update_task with that user_id as `assignee_id`."""
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
        "url": f"{client.web_url}/browse/{task['identifier']}",
    }


@mcp.tool()
async def update_task(
    task_identifier: str,
    workspace_slug: str | None = None,
    status: Literal[
        "backlog", "todo", "in_progress", "in_review", "done", "cancelled"
    ]
    | None = None,
    title: str | None = None,
    priority: Literal["urgent", "high", "medium", "low", "no_priority"]
    | None = None,
    description: str | None = _UNSET,
    due_date: str | None = _UNSET,
    assignee_id: str | None = _UNSET,
    sprint_id: str | None = _UNSET,
    archived: bool | None = None,
) -> dict[str, Any]:
    """Edit a task — one tool for any combination of its fields. Only the
    arguments you pass are changed; everything you omit is left untouched, so
    you can do several edits in a single call (e.g. 'mark TRAC-7 done and bump
    it to high' → status='done', priority='high').

    Identify the task by its human identifier (e.g. 'TRAC-7'). Fields:
    - `status`: move between columns ('move TRAC-7 to in progress', 'mark done').
    - `title`: rename ('rename TRAC-7 to ...').
    - `priority`: 'this is urgent', 'bump to high'. Pass 'no_priority' to clear.
    - `description`: replace the markdown body. To APPEND, first `get_task` to
      read the current body, edit it, then pass the combined text.
    - `due_date`: an ISO 8601 calendar date (YYYY-MM-DD). Convert relative dates
      ('Friday', 'next Monday') to absolute YYYY-MM-DD before calling.
    - `assignee_id`: a user UUID, or the literal string "me" for the current
      user (resolved from the request context — saves a lookup). To assign by
      name, `list_workspace_members` first to map name → user_id.
    - `sprint_id`: a sprint UUID. For 'the active/current sprint', call
      `list_sprints` first and use the one whose status is 'active'.
    - `archived`: true to archive ('archive TRAC-7', 'move it to the
      archive'), false to unarchive/restore. Archiving is reversible — the
      task disappears from boards and lists but keeps all its data and stays
      editable. Archived tasks are still found by identifier (get_task /
      update_task work as usual); to browse them, `list_tasks` with
      archived=true and a project_key.

    Clearing: `description`, `due_date`, `assignee_id`, and `sprint_id` accept
    null to CLEAR them ('unassign FE-12', 'clear the deadline', 'pull out of the
    sprint'). Omitting an argument leaves that field unchanged. Returns the
    updated task; the server enforces workspace membership.

    Pass `workspace_slug` whenever you know it (e.g. from list_tasks). Task
    identifiers aren't unique across workspaces, so for a multi-workspace user
    this is what guarantees the edit lands on the intended task rather than a
    same-numbered task in another workspace."""
    payload: dict[str, Any] = {}
    if status is not None:
        payload["status"] = status
    if title is not None:
        payload["title"] = title
    if priority is not None:
        payload["priority"] = priority
    if description is not _UNSET:
        payload["description"] = description
    if due_date is not _UNSET:
        payload["due_date"] = due_date
    if assignee_id is not _UNSET:
        if assignee_id == "me":
            from .context import get_user_id
            assignee_id = get_user_id()
        payload["assignee_id"] = assignee_id
    if sprint_id is not _UNSET:
        payload["sprint_id"] = sprint_id
    if archived is not None:
        payload["archived"] = archived

    if not payload:
        raise TracklyError(
            "update_task called with no fields to change — pass at least one of "
            "status, title, priority, description, due_date, assignee_id, "
            "sprint_id, archived."
        )

    client = get_client()
    resolved = await resolve_task_identifier(task_identifier, workspace_slug)
    return await client.patch(f"/tasks/{resolved['task_id']}", json=payload)


@mcp.tool()
async def add_comment(
    task_identifier: str, body: str, workspace_slug: str | None = None
) -> dict[str, Any]:
    """Post a comment on a task. Markdown is rendered. Use when the
    user says 'comment on TRAC-7 with ...', 'add a note to ...', or
    when reporting back about work done on a task. Returns the new
    comment row. Pass `workspace_slug` when known so the comment lands on the
    intended task (identifiers aren't unique across workspaces)."""
    client = get_client()
    resolved = await resolve_task_identifier(task_identifier, workspace_slug)
    return await client.post(
        f"/tasks/{resolved['task_id']}/comments",
        json={"body": body},
    )


@mcp.tool()
async def delete_comment(
    comment_id: str, confirm: bool = False
) -> dict[str, Any]:
    """Delete a comment. DESTRUCTIVE and permanent — you can only delete
    comments YOU authored (deleting someone else's returns an error).

    Get `comment_id` from `get_task`, whose `comments` list carries each
    comment's `id` and `body`.

    Two-step confirmation is REQUIRED. First call with `confirm=False` (the
    default): nothing is deleted. Then show the user the exact comment you are
    about to delete (you already have its text from `get_task`) and get their
    explicit go-ahead. Only after they confirm, call again with `confirm=True`
    to actually delete. Never pass `confirm=True` without having shown the
    comment and received a clear yes."""
    if not confirm:
        return {
            "requires_confirmation": True,
            "comment_id": comment_id,
            "message": (
                "This permanently deletes the comment. Show the user the "
                "comment you're about to delete (you have its text from "
                "get_task) and get explicit confirmation, then call again "
                "with confirm=True. You can only delete your own comments."
            ),
        }
    client = get_client()
    await client.delete(f"/comments/{comment_id}")
    return {"ok": True, "deleted_comment_id": comment_id}


@mcp.tool()
async def list_checklist(
    task_identifier: str, workspace_slug: str | None = None
) -> list[dict[str, Any]]:
    """List a task's checklist items (its subtasks/acceptance criteria). Use
    when the user asks 'what's on the checklist for TRAC-7', 'show the
    subtasks', or — importantly — BEFORE checking/unchecking or deleting an
    item, to get its `id`. Returns each item's id, text, done, position. Pass
    `workspace_slug` when known to pin the exact task across workspaces."""
    client = get_client()
    resolved = await resolve_task_identifier(task_identifier, workspace_slug)
    return await client.get(f"/tasks/{resolved['task_id']}/checklist")


@mcp.tool()
async def add_checklist_item(
    task_identifier: str, text: str, workspace_slug: str | None = None
) -> dict[str, Any]:
    """Add a checklist item (subtask) to a task. Use when the user says 'add a
    checklist item to TRAC-7: …', 'add subtask …', or breaks a task into
    steps. Returns the new item (id, text, done=false, position). Pass
    `workspace_slug` when known to pin the exact task across workspaces."""
    client = get_client()
    resolved = await resolve_task_identifier(task_identifier, workspace_slug)
    return await client.post(
        f"/tasks/{resolved['task_id']}/checklist",
        json={"text": text},
    )


@mcp.tool()
async def set_checklist_item(
    item_id: str,
    done: bool | None = None,
    text: str | None = None,
) -> dict[str, Any]:
    """Update a checklist item by its `id` (get it from list_checklist first).
    Pass `done` true/false to check / uncheck it, and/or `text` to rename it.
    Use when the user says 'check off the X item', 'mark … done', 'uncheck …',
    'rename that subtask'. Returns the updated item."""
    client = get_client()
    payload: dict[str, Any] = {}
    if done is not None:
        payload["done"] = done
    if text is not None:
        payload["text"] = text
    return await client.patch(f"/checklist/{item_id}", json=payload)


@mcp.tool()
async def delete_checklist_item(item_id: str) -> dict[str, Any]:
    """Delete a checklist item by its `id` (from list_checklist). Use when the
    user says 'remove that subtask', 'delete the … checklist item'. Returns
    {"deleted": <item_id>}."""
    client = get_client()
    await client.delete(f"/checklist/{item_id}")
    return {"deleted": item_id}


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
