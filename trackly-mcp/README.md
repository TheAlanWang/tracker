# trackly-mcp

MCP server that exposes the [Trackly](https://tracker.thealanwang.xyz) task tracker to MCP clients (Claude Code, Claude Desktop, Cursor, etc.).

Drop it in your config and you can say things like *"create a tracker task in TRAC titled 'Fix login bug'"* or *"what's on my plate this week?"* directly in your editor — the client picks the right Trackly tool and runs it.

## Tools

| Tool | What it does |
|---|---|
| `list_workspaces` | Every workspace you're a member of |
| `list_projects` | Projects inside a workspace |
| `list_my_tasks` | Tasks assigned to you, optionally filtered by status |
| `get_task` | Full task details + recent comments, by identifier (e.g. `TRAC-7`) |
| `search` | Substring search across tasks / projects / labels |
| `create_task` | New task in a project |
| `update_task_status` | Move a task to backlog / todo / in_progress / in_review / done / cancelled |
| `add_comment` | Post a comment on a task (markdown) |

## Setup

### 1. Install

```bash
cd trackly-mcp
uv sync
```

### 2. Find your credentials

- `TRACKLY_USER_ID` — your Trackly account's user UUID. Get it from Supabase → Authentication → Users (find your row, copy the id), or from any URL of yours that includes a user-id parameter, or from the `auth.users.id` column directly.
- `TRACKLY_JWT_SECRET` — the same `SUPABASE_JWT_SECRET` the Trackly backend uses to verify tokens. From Supabase → Project Settings → API → JWT Settings → `JWT Secret` (the legacy HS256 one).

### 3. Register the server

**Claude Code** — `~/.claude.json`:

```json
{
  "mcpServers": {
    "trackly": {
      "command": "uv",
      "args": [
        "--directory",
        "/Users/alanwang/MyFiles/Project/tracker/trackly-mcp",
        "run",
        "trackly-mcp"
      ],
      "env": {
        "TRACKLY_API_URL": "https://tracker-thealanwang.fly.dev",
        "TRACKLY_USER_ID": "<your-supabase-user-uuid>",
        "TRACKLY_JWT_SECRET": "<your-supabase-jwt-secret>"
      }
    }
  }
}
```

**Claude Desktop** — same JSON, in `~/Library/Application Support/Claude/claude_desktop_config.json`.

**Cursor** — same JSON, in `~/.cursor/mcp.json`.

### 4. Try it

Restart your MCP client. In a new conversation:

```
> /mcp
# should list "trackly" with 8 tools

> What tasks do I have open in workspace my-workspace?
# → list_my_tasks fires, returns your assigned tasks

> Create a tracker task in TRAC titled "Try MCP integration"
# → create_task fires, returns the new task + URL

> Move TRAC-12 to in_progress
# → update_task_status fires

> Add a comment to TRAC-12: "Working on this now"
# → add_comment fires
```

## Development

```bash
uv run pytest -q        # smoke tests
uv run trackly-mcp      # run server in stdio mode (for debugging)
```

The smoke tests don't hit the network; for end-to-end verification, point Claude Code at the running server and confirm tools fire against the prod backend.

## Notes

- Auth: MCP mints a short-lived HS256 user-JWT (`aud=authenticated`, `sub=<your-user-id>`) on every request, signed with the shared `SUPABASE_JWT_SECRET`. The backend can't tell it apart from a real browser session token. **Keep the secret out of git** — it's an env var.
- Transport: stdio. Each MCP client launches the server as a subprocess and talks JSON-RPC over its stdin/stdout pipe. Nothing listens on a port.
- A future v2 will add an HTTP/SSE transport + OAuth so other people can use it without sharing your JWT secret.
