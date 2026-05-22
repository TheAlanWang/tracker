# Trackly

An opinionated task tracker, built around one principle: **flat tasks by default, methodology-specific features as opt-in flags.**

**Live demo:** [tracker.thealanwang.xyz](https://tracker.thealanwang.xyz) — sign up with email or Google.

![License](https://img.shields.io/badge/license-PolyForm%20Noncommercial-blue) ![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white) ![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white) ![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?logo=fastapi&logoColor=white) ![Supabase](https://img.shields.io/badge/Supabase-Postgres+Auth-3ECF8E?logo=supabase&logoColor=white) ![Fly.io](https://img.shields.io/badge/Fly.io-backend-8B5CF6?logo=fly.io&logoColor=white) ![Vercel](https://img.shields.io/badge/Vercel-frontend-000000?logo=vercel&logoColor=white)

Built local-first with a clean path to cloud deployment. Vite + React + TypeScript on the front, FastAPI on the back, Supabase (Postgres + Auth + Storage + Realtime) for data.

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
| Tailwind v3 + shadcn | uv (deps), pytest | Supabase Auth (email + Google OAuth, JWKS) | Backend: Fly.io (Dockerfile) |
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
trackly-mcp/          MCP server (in development) — see below
```

## Architecture notes

- **RLS-first**: every table is gated by Supabase Row Level Security. Backend uses per-user JWTs so RLS evaluates the actual caller (no service-role short-circuiting).
- **Single source of truth for chips**: `frontend/src/features/tasks/labels.ts` owns the `STATUS` / `PRIORITY` config; `components/StatusPill.tsx` renders. Every status / priority chip in the app reads through these.
- **Tables share chrome**: `components/TaskTableCard.tsx` owns the sticky thead + `table-fixed` + rounded card. Each list page brings its own columns + rows.
- **Activity history**: triggers in `supabase/migrations/` capture field-level diffs into `task_activity`; one row per saved field.
- **Dependencies**: BFS over the directed dep graph at save-time to reject cycles.
- **JWKS-cached auth**: backend caches one `PyJWKClient` per issuer URL (`core/security.py`) — first JWT verify hits Supabase JWKS, subsequent ones reuse the cached key for 10 minutes. Avoids a per-request TLS round-trip on every authenticated call.

## MCP server (in development)

`trackly-mcp/` exposes the Trackly REST API as a [Model Context Protocol](https://modelcontextprotocol.io) server so Claude Code / Claude Desktop / Cursor can drive the tracker directly from chat — "create a task in TRAC titled 'Fix login bug'", "what's on my plate this week?", "mark TRAC-7 done".

Stack: Python + the official `mcp[cli]` SDK, `httpx` for the API client, `PyJWT` for HS256 user-token minting (same shape as a Supabase session, signed with the shared backend secret).

V1 ships 8 tools — `list_workspaces`, `list_projects`, `list_my_tasks`, `get_task`, `search`, `create_task`, `update_task_status`, `add_comment` — over the stdio transport. Auth is a single-user dev model: the JWT secret lives on the user's machine in `~/.claude.json`, so the server speaks to the backend as the configured user.

V2 (planned): switch to HTTP/SSE transport, add an OAuth 2.1 flow so anyone can connect their own Trackly account without sharing secrets, and deploy the MCP server alongside the backend.

See `trackly-mcp/README.md` for setup + Claude Code / Cursor / Desktop registration JSON.

## Deployment

Everything in this repo deploys on `git push`:

- **Frontend** → Vercel (Vite preset auto-detects everything; SPA rewrites are built-in). Served from `tracker.thealanwang.xyz` via Vercel-managed DNS.
- **Backend** → Fly.io via GitHub Actions (`.github/workflows/fly-deploy.yml`). One `shared-cpu-1x` machine in `iad` with 512MB RAM. Dockerfile uses `uv` for fast deps installs.
- **Supabase** → GitHub Integration auto-applies new SQL in `supabase/migrations/` on push to `main`.
- **Email** → Resend SMTP wired into Supabase Auth (sender domain verified via SPF + DKIM).

Env vars are managed per platform (Render env tab, `fly secrets`, Supabase Dashboard). No prod `.env` files in the repo — see `backend/.env.example` and `frontend/.env.example` for the dev template, and the `APP_ENV` switch in `backend/app/core/config.py` for how `.env.dev` / `.env.prd` are selected.

## License

Trackly is source-available under the
[PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/) — see [`LICENSE`](./LICENSE).

You may use, modify, and share Trackly for **noncommercial purposes** —
personal projects, research, education, hobby, internal team use at
noncommercial organizations. For **commercial use** (embedding in a
revenue-generating product, offering as SaaS, internal use at a
for-profit company), please contact **wang.h5@northeastern.edu** for
a commercial license.
