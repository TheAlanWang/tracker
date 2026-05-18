# Tracker

A modern, Linear / Jira-style task tracker for small teams.

**Live demo:** [tracker-lr3b.onrender.com](https://tracker-lr3b.onrender.com) — sign up with email or Google.

![License](https://img.shields.io/badge/license-MIT-blue) ![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white) ![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white) ![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?logo=fastapi&logoColor=white) ![Supabase](https://img.shields.io/badge/Supabase-Postgres+Auth-3ECF8E?logo=supabase&logoColor=white) ![Fly.io](https://img.shields.io/badge/Fly.io-backend-8B5CF6?logo=fly.io&logoColor=white) ![Render](https://img.shields.io/badge/Render-frontend-46E3B7?logo=render&logoColor=white)

Built local-first with a clean path to cloud deployment. Vite + React + TypeScript on the front, FastAPI on the back, Supabase (Postgres + Auth + Storage + Realtime) for data.

## Features

- **Workspaces, projects, sprints** — multi-tenant from the start; per-project boards, lists, and sprint cycles.
- **Tasks** with status, priority, assignee, due date, labels, watchers, mentions.
- **Dependencies** between tasks with BFS cycle detection (so you can't create A→B→C→A).
- **Hierarchical Goals** — Miller Columns + mind-map view (replaces the muddier "sub-tasks" model with explicit OKR-style hierarchy).
- **Lightweight checklists** on each task (decoupled from task status, soft reminder if you close a task with unchecked items).
- **Sprints** with Burndown + Velocity charts.
- **Realtime updates**, in-app notifications, workspace invitations.
- **Activity history** per task — field-level diffs, one entry per save.
- **CSV export** on every list view.
- **Dark mode** end-to-end (theme toggle in avatar dropdown; respects system pref by default).
- **Command palette**, document titles, 404 page, error boundary — the usual polish.

## Tech stack

| Frontend | Backend | Data | Hosting |
| --- | --- | --- | --- |
| Vite + React 18 + TS | FastAPI (Python 3.12+) | Supabase Postgres + RLS | Frontend: Render (static) |
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
```

## Architecture notes

- **RLS-first**: every table is gated by Supabase Row Level Security. Backend uses per-user JWTs so RLS evaluates the actual caller (no service-role short-circuiting).
- **Single source of truth for chips**: `frontend/src/features/tasks/labels.ts` owns the `STATUS` / `PRIORITY` config; `components/StatusPill.tsx` renders. Every status / priority chip in the app reads through these.
- **Tables share chrome**: `components/TaskTableCard.tsx` owns the sticky thead + `table-fixed` + rounded card. Each list page brings its own columns + rows.
- **Activity history**: triggers in `supabase/migrations/` capture field-level diffs into `task_activity`; one row per saved field.
- **Dependencies**: BFS over the directed dep graph at save-time to reject cycles.
- **JWKS-cached auth**: backend caches one `PyJWKClient` per issuer URL (`core/security.py`) — first JWT verify hits Supabase JWKS, subsequent ones reuse the cached key for 10 minutes. Avoids a per-request TLS round-trip on every authenticated call.

## Deployment

Everything in this repo deploys on `git push`:

- **Frontend** → Render Static Site (build = `pnpm install && pnpm build`, publish = `dist`), rewrites `/*` → `/index.html` for the SPA router.
- **Backend** → Fly.io via GitHub Actions (`.github/workflows/fly-deploy.yml`). One `shared-cpu-1x` machine in `iad` with 512MB RAM. Dockerfile uses `uv` for fast deps installs.
- **Supabase** → GitHub Integration auto-applies new SQL in `supabase/migrations/` on push to `main`.
- **Email** → Resend SMTP wired into Supabase Auth (sender domain verified via SPF + DKIM).

Env vars are managed per platform (Render env tab, `fly secrets`, Supabase Dashboard). No prod `.env` files in the repo — see `backend/.env.example` and `frontend/.env.example` for the dev template, and the `APP_ENV` switch in `backend/app/core/config.py` for how `.env.dev` / `.env.prd` are selected.

## License

[MIT](./LICENSE)
