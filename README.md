# Trackly

An opinionated task tracker, built around one principle: **flat tasks by default, methodology-specific features as opt-in flags.**

**Live demo:** [gettrackly.dev](https://gettrackly.dev) — sign up with email or Google.

![License](https://img.shields.io/badge/license-PolyForm%20Noncommercial-blue) ![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white) ![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white) ![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?logo=fastapi&logoColor=white) ![Supabase](https://img.shields.io/badge/Supabase-Postgres+Auth-3ECF8E?logo=supabase&logoColor=white) ![Railway](https://img.shields.io/badge/Railway-backend-0B0D0E?logo=railway&logoColor=white) ![Vercel](https://img.shields.io/badge/Vercel-frontend-000000?logo=vercel&logoColor=white)

Built local-first with a clean path to cloud deployment. Vite + React + TypeScript on the front, FastAPI on the back, Supabase (Postgres + Auth + Storage + Realtime) for data.

It's also **built for your team and your AI**: there's an [AI assistant](#ai-assistant) built into every board that turns goals into tasks, and every workspace is fully operable over an [MCP server](#mcp-server) — so your own AI tools drive the same board your team does, no separate integration.

## Why

Most task trackers force a methodology on you the moment you sign up. Some assume you're running sprints. Others assume you're nesting issues inside projects inside cycles. Either way, the full feature surface appears to every new user — including the parts you don't need.

Trackly takes the opposite approach. The core experience is a flat list of tasks — atomic units of work with an identifier (FE-12), a status, an assignee, and a due date. That's it. No nesting, no Epics, no required ceremony.

Around that core, optional layers expand the model for teams that need them:

- **Goals** — a recursive "why" layer above tasks, for OKR-style rollup.
- **Sprints** — time-boxed planning, for teams running agile cadences.
- **Dependencies** — directed "blocks" relationships between tasks, for multi-step coordination.

These layers are designed to be gated per-workspace via a JSONB feature flag on `workspaces.features`, so new workspaces start minimal and workspaces that need more turn on what fits their methodology. Goals is the first feature actually gated today; Sprints and Dependencies are on the same pattern.

The bet: onboarding friction matters more than feature completeness, and opinionated defaults serve users better than infinite configuration.

## Features

### Core

- **AI assistant** — an in-app, project-scoped chat that breaks goals into tasks, creates and assigns them, updates the board, and remembers how you work. Metered per plan. See [AI assistant](#ai-assistant).
- **Tasks** with status, priority, assignee, due date, labels, watchers, mentions.
- **Workspaces & projects** — multi-tenant from the start; per-project boards and lists.
- **Lightweight checklists** on each task (decoupled from task status, soft reminder if you close a task with unchecked items).
- **Realtime updates**, in-app notifications, workspace invitations.
- **Activity history** per task — field-level diffs, one entry per save.
- **CSV export** on every list view.
- **Dark mode** end-to-end (theme toggle in avatar dropdown; respects system pref by default).
- **Command palette**, document titles, 404 page, error boundary — the usual polish.

### Opt-in (per-workspace feature flag)

- **Hierarchical Goals** — Miller Columns + mind-map view, for OKR-style rollup. Replaces the muddier "sub-tasks" model with explicit hierarchy.
- **Sprints** with Burndown + Velocity charts — time-boxed planning for teams running agile cadences.
- **Dependencies** between tasks with BFS cycle detection (so you can't create A→B→C→A), for multi-step coordination.

## Tech stack

| Frontend | Backend | Data | Hosting |
| --- | --- | --- | --- |
| Vite + React 18 + TS | FastAPI (Python 3.12+) | Supabase Postgres + RLS | Frontend: Vercel + custom domain |
| Tailwind v3 + shadcn | uv (deps), pytest | Supabase Auth (email + Google OAuth, JWKS) | Backend: Railway (Dockerfile) |
| React Query v5 | PyJWT (ES256 via JWKS, HS256 for service tokens) | Supabase Storage (avatars) | DB / Auth: Supabase Cloud |
| react-router v6 | python-dotenv (`APP_ENV=dev/prd`) | Realtime via Supabase channels | Email: Resend SMTP |

## Run locally

**Prerequisites**

- Node 20+, pnpm (`npm i -g pnpm`)
- Python 3.12+
- uv (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- Docker (for Supabase Local)
- Supabase CLI (`brew install supabase/tap/supabase`)

**Setup**

```bash
# 1. Install deps
make install

# 2. Start Supabase Local (downloads images on first run, ~2 min)
supabase start

# 3. Copy printed keys into env files
supabase status   # prints anon_key, service_role_key, JWT secret
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
# Paste the values from `supabase status` into both files.

# 4. Start the full stack (frontend on :5173, API on :8000)
make dev
```

Open <http://localhost:5173>, sign up, and you're in.

See `make help` for every available command (tests, lint, db reset, etc.).

## Project layout

```
frontend/             Vite + React app
  src/components/     Shared UI (StatusPill, TaskTableCard, ...)
  src/features/       Per-feature API hooks (tasks, sprints, goals, ...)
  src/pages/          Route-level pages
backend/
  app/routers/        FastAPI route modules
  app/services/       Business logic (one file per domain)
  app/schemas/        Pydantic models
  tests/              pytest suite
supabase/migrations/  Versioned SQL migrations
trackly-mcp/          MCP server — see below
```

## Architecture notes

- **RLS-first**: every table is gated by Supabase Row Level Security. Backend uses per-user JWTs so RLS evaluates the actual caller (no service-role short-circuiting).
- **Single source of truth for chips**: `frontend/src/features/tasks/labels.ts` owns the `STATUS` / `PRIORITY` config; `components/StatusPill.tsx` renders. Every status / priority chip in the app reads through these.
- **Tables share chrome**: `components/TaskTableCard.tsx` owns the sticky thead + `table-fixed` + rounded card. Each list page brings its own columns + rows.
- **Activity history**: triggers in `supabase/migrations/` capture field-level diffs into `task_activity`; one row per saved field.
- **Dependencies**: BFS over the directed dep graph at save-time to reject cycles.
- **JWKS-cached auth**: backend caches one `PyJWKClient` per issuer URL (`core/security.py`) — first JWT verify hits Supabase JWKS, subsequent ones reuse the cached key for 10 minutes. Avoids a per-request TLS round-trip on every authenticated call.

## AI assistant

Every project has a built-in assistant — open the panel on any board and say what you want. It's a Claude tool-use loop running server-side (no framework), streamed into a chat panel. It:

- sees a snapshot of the current board, so you don't paste context;
- breaks goals into tasks, creates and assigns them, moves/updates existing ones, and comments — all through the same services and Row Level Security as the human UI, acting **as you** (it can't touch anything you can't);
- proposes before it creates, and the board updates live as it works;
- persists your conversation per project, and a long-term memory of your preferences per workspace — isolated per user, never crossing the workspace (tenant) boundary.

Tool names mirror the MCP server's, so behavior stays in parity across the human UI, MCP, and the in-app agent. Usage is metered as a per-plan monthly cap (Free / Pro), enforced before each turn. Enable it by setting `ANTHROPIC_API_KEY` on the backend (`AGENT_MODEL` is configurable, default `claude-sonnet-4-6`); unset, the panel shows a graceful "not configured" state and the rest of the app is unaffected.

## MCP server

`trackly-mcp/` exposes Trackly as a [Model Context Protocol](https://modelcontextprotocol.io) server, so Claude Code / Claude Desktop / Cursor can drive the tracker directly from chat — "create a task in RAG titled 'Fix login bug'", "what's on my plate this week?", "mark RAG-7 done".

It's live and hosted at `https://mcp.gettrackly.dev/mcp` over HTTP, with an OAuth 2.1 flow (Dynamic Client Registration) so anyone connects their own Trackly account — no shared secrets. From Claude Code:

```bash
claude mcp add --transport http trackly https://mcp.gettrackly.dev/mcp
```

It exposes the full toolset: list / get workspaces, projects, tasks, and sprints; search; create and update tasks; comment; manage checklists; and read recent activity and workspace members.

Stack: Python + the official `mcp` SDK, `httpx` for the API client, `PyJWT` (ES256 via JWKS) for auth.

See `trackly-mcp/README.md` for setup + Claude Code / Cursor / Desktop registration.

## Deployment

Everything in this repo deploys on `git push`:

- **Frontend** → Vercel (Vite preset auto-detects everything; SPA rewrites are built-in). Served from `gettrackly.dev` via Vercel-managed DNS.
- **Backend** → Railway, auto-deployed from GitHub on push to `main`. Two services: `trackly-api` (`api.gettrackly.dev`) built from `backend/`, and `trackly-mcp` (`mcp.gettrackly.dev`) built from `trackly-mcp/`. Each builds from its own Dockerfile (uses `uv` for fast deps installs).
- **Supabase** → GitHub Integration auto-applies new SQL in `supabase/migrations/` on push to `main`.
- **Email** → Resend SMTP wired into Supabase Auth (sender domain verified via SPF + DKIM).

Env vars are managed per platform (Vercel env tab, Railway service Variables, Supabase Dashboard). No prod `.env` files in the repo — see `backend/.env.example` and `frontend/.env.example` for the dev template, and the `APP_ENV` switch in `backend/app/core/config.py` for how `.env.dev` / `.env.prd` are selected.

## License

Trackly is source-available under the
[PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/) — see [`LICENSE`](./LICENSE).

You may use, modify, and share Trackly for **noncommercial purposes** —
personal projects, research, education, hobby, internal team use at
noncommercial organizations. For **commercial use** (embedding in a
revenue-generating product, offering as SaaS, internal use at a
for-profit company), please contact **alanwang166@gmail.com** for
a commercial license.
