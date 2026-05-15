.PHONY: help install dev api web test test-api test-web test-e2e migrate seed clean db-status

help:
	@echo "Common targets:"
	@echo "  install     install all dependencies (api + web)"
	@echo "  dev         start full stack (supabase + api + web)"
	@echo "  api         start only the FastAPI server"
	@echo "  web         start only the Vite dev server"
	@echo "  test        run all tests (api + web + e2e)"
	@echo "  test-api    run backend pytest"
	@echo "  test-web    run frontend vitest"
	@echo "  test-e2e    run Playwright E2E tests"
	@echo "  migrate     reset and apply migrations (destructive)"
	@echo "  seed        apply seed.sql"
	@echo "  clean       stop Supabase Local"
	@echo "  db-status   print Supabase Local URLs and keys"

install:
	cd apps/api && uv sync
	cd apps/web && pnpm install

dev:
	@echo "Starting Supabase Local…"
	@supabase status > /dev/null 2>&1 || supabase start
	@echo ""
	@echo "Starting api on :8000 and web on :5173"
	@echo "Press Ctrl+C to stop. Supabase keeps running; run 'make clean' to stop it."
	@(cd apps/api && uv run uvicorn app.main:app --port 8000 --reload) & \
	 (cd apps/web && pnpm dev) ; \
	 wait

api:
	cd apps/api && uv run uvicorn app.main:app --port 8000 --reload

web:
	cd apps/web && pnpm dev

test: test-api test-web

test-api:
	cd apps/api && uv run pytest

test-web:
	cd apps/web && pnpm tsc --noEmit

test-e2e:
	cd apps/web && pnpm exec playwright test

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
