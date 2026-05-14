# tracker

A Linear/Jira-style task tracker for personal and small-team use.

## Setup

1. Install prerequisites: Python 3.12+, Node 20+, pnpm, uv, Docker, supabase CLI.
2. Copy `.env.example` to `.env` and fill in values (see below).
3. Start Supabase Local: `supabase start`. Copy the printed `anon_key`, `service_role_key`, and `JWT secret` into `.env`.
4. Run `make dev` to start the full stack.

See `docs/superpowers/specs/2026-05-14-tracker-design.md` for the design spec.

## Repo layout

- `apps/web/` — Vite + React frontend
- `apps/api/` — FastAPI backend
- `supabase/` — DB migrations + Supabase config
- `docs/` — design specs and implementation plans
