.PHONY: help install dev dev-prd api api-prd web web-prd bench test test-api test-web test-e2e migrate seed clean db-status

# Use a globally installed pnpm if there is one; otherwise run the version the
# lockfile was built with via npx (no global install needed).
PNPM ?= $(shell command -v pnpm 2>/dev/null || echo npx -y pnpm@9.15.9)

# Bench tunables — override on the CLI:  make bench COUNT=50 CONC=5
COUNT ?= 100
CONC ?= 1

help:
	@echo "Common targets:"
	@echo "  install      install all dependencies (api + web)"
	@echo "  dev          start full stack against LOCAL supabase (.env.dev)"
	@echo "  dev-prd      start full stack against HOSTED supabase (.env.prd) — be careful"
	@echo "  api          start only the FastAPI server (.env.dev)"
	@echo "  api-prd      start only the FastAPI server (.env.prd)"
	@echo "  web          start only the Vite dev server (.env.dev)"
	@echo "  web-prd      start only the Vite dev server (.env.prd)"
	@echo "  bench        latency benchmark against PROD /me/dashboard"
	@echo "                 override: make bench COUNT=50 CONC=5"
	@echo "  test         run all tests (api + web + e2e)"
	@echo "  test-api     run backend pytest"
	@echo "  test-web     run frontend vitest"
	@echo "  test-e2e     run Playwright E2E tests"
	@echo "  migrate      reset and apply migrations (destructive, local only)"
	@echo "  seed         apply seed.sql"
	@echo "  clean        stop Supabase Local"
	@echo "  db-status    print Supabase Local URLs and keys"

install:
	cd backend && uv sync
	cd frontend && $(PNPM) install

dev:
	@echo "Starting Supabase Local…"
	@supabase status > /dev/null 2>&1 || supabase start
	@echo ""
	@echo "→ Using .env.dev (local Supabase). Starting api :8000 + web :5173"
	@(cd backend && APP_ENV=dev uv run uvicorn app.main:app --port 8000 --reload) & \
	 (cd frontend && $(PNPM) dev) ; \
	 wait

dev-prd:
	@echo "⚠️  Using .env.prd (HOSTED Supabase). No local Supabase needed."
	@echo "→ Starting api :8000 + web :5173"
	@(cd backend && APP_ENV=prd uv run uvicorn app.main:app --port 8000 --reload) & \
	 (cd frontend && $(PNPM) dev:prd) ; \
	 wait

api:
	cd backend && APP_ENV=dev uv run uvicorn app.main:app --port 8000 --reload

api-prd:
	cd backend && APP_ENV=prd uv run uvicorn app.main:app --port 8000 --reload

web:
	cd frontend && $(PNPM) dev

web-prd:
	cd frontend && $(PNPM) dev:prd

bench:
	@cd backend && APP_ENV=prd uv run python -m scripts.bench --count $(COUNT) --concurrency $(CONC)

test: test-api test-web

test-api:
	cd backend && uv run pytest

test-web:
	cd frontend && $(PNPM) exec tsc --noEmit

test-e2e:
	cd frontend && $(PNPM) exec playwright test

migrate:
	supabase db reset

seed:
	@if [ -s supabase/seed.sql ]; then \
	  PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/seed.sql ; \
	else \
	  echo "supabase/seed.sql is empty or absent; nothing to seed."; \
	fi

clean:
	supabase stop

db-status:
	supabase status
