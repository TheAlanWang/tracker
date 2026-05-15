# tracker

A Linear/Jira-style task tracker for personal and small-team use.

Built local-first with a clear path to cloud deployment. See `docs/superpowers/specs/2026-05-14-tracker-design.md` for the design spec.

## Setup

### Prerequisites
- Python 3.12+
- Node 20+, pnpm (`npm i -g pnpm`)
- uv (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- Docker (for Supabase Local)
- Supabase CLI (`brew install supabase/tap/supabase` on macOS, or see https://supabase.com/docs/guides/cli)

### First-time setup

```bash
# 1. Install dependencies
make install

# 2. Start Supabase Local (downloads images on first run, takes ~2 min)
supabase start

# 3. Copy printed keys into env files
supabase status   # prints anon_key, service_role_key, JWT secret
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
# Edit .env and apps/web/.env.local, paste the values.
# The api reads .env in the repo root; the web reads .env.local in apps/web.

# 4. Start the full stack
make dev
```

Open http://localhost:5173 — you should land on the login page.

### Commands

Run `make help` for the full list.

## Repo layout

- `apps/web/` — Vite + React + TypeScript frontend (Tailwind + shadcn/ui)
- `apps/api/` — FastAPI backend (Python + uv)
- `supabase/` — DB migrations + Supabase config
- `docs/superpowers/specs/` — design specs
- `docs/superpowers/plans/` — implementation plans

## Plan 1 status

This is the **Foundation + Auth** plan. After running through it, you have:
- Working sign-up / sign-in / sign-out via Supabase Auth (email/password + Google OAuth)
- A protected home page that calls `GET /me` on the FastAPI backend
- Supabase Local running with RLS enabled
- Playwright E2E covering the auth flow

Plan 2 (next) adds: Workspaces + Projects CRUD.
