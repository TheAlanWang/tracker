# trackly-mcp

Hosted MCP server that exposes the [Trackly](https://gettrackly.dev) task tracker to MCP clients (Claude Desktop, Claude Code, Cursor, etc.).

Drop the URL in your config, sign in once with your Trackly account, and you can say things like *"create a tracker task in TRAC titled 'Fix login bug'"* directly in your editor — the client picks the right Trackly tool and runs it.

## Tools

19 tools across read + write. See `src/trackly_mcp/server.py` for the full list and the LLM-facing docstrings.

## Setup (users)

### 1. Register the server

**Claude Code / Claude Desktop / Cursor** — add to your MCP config:

```json
{
  "mcpServers": {
    "trackly": {
      "url": "https://mcp.gettrackly.dev/mcp"
    }
  }
}
```

That's it. No env vars, no secrets, no Python install.

### 2. First use

Restart your MCP client. In a new conversation:

```
> /mcp
```

The client will open your browser to a "Sign in to Trackly" page. Pick GitHub or Google — whichever you use for Trackly. Once signed in, you're done; the token is stored in your client's keychain and refreshed automatically.

### 3. Try it

```
> What tasks do I have open in workspace my-workspace?
> Create a tracker task in TRAC titled "Try MCP integration"
> Move TRAC-12 to in_progress
> Add a comment to TRAC-12: "Working on this now"
```

## Architecture

MCP server is an OAuth 2.1 resource server. It proxies authorization to Supabase (where Trackly's user accounts live), validates the resulting access token on every `/mcp` request, and forwards the user's verified token to the existing Trackly REST API. The server holds no per-user state; tokens live in your MCP client's keychain.

See `docs/superpowers/specs/2026-05-25-trackly-mcp-v2-design.md` for the detailed design.

## Development

```bash
cd trackly-mcp
uv sync                  # install
uv run pytest -v         # all unit + integration tests
```

To boot a local copy:

```bash
export SUPABASE_URL=https://yjngyftaaenftmksjxbn.supabase.co
export SUPABASE_JWT_SECRET=...      # server-side ONLY (Railway variable in prod)
export SUPABASE_ANON_KEY=...
export TRACKLY_API_URL=https://api.gettrackly.dev
export SERVER_BASE_URL=http://localhost:8080
export PORT=8080
uv run trackly-mcp
```

> **Security:** `SUPABASE_JWT_SECRET` is server-side only. It is never read on a user's machine. The user-facing config (above) contains no secrets.

## Deployment

Hosted on Railway as the `trackly-mcp` service (`mcp.gettrackly.dev`), auto-deployed from GitHub on push to `main`. Built from this directory's `Dockerfile`.

Secrets/env are managed in the Railway dashboard (service → Variables).

## Differences from v1

- v1 was a Python package users installed locally and ran via stdio, authenticated by minting JWTs with the shared Trackly `SUPABASE_JWT_SECRET` (which had to be copied to every user's machine).
- v2 is hosted multi-tenant with OAuth. The shared secret stays on the server; users sign in with their own accounts.

If you used v1, delete the `TRACKLY_USER_ID` / `TRACKLY_JWT_SECRET` env vars from your shell rc and update your MCP config to the URL above.
