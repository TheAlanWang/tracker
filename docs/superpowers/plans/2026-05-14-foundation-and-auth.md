# Foundation + Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the tracker repo with a working full-stack hello-world: user can sign up / sign in / sign out via Supabase Auth, see their email on a protected page, and the entire stack runs with `make dev`.

**Architecture:** Monorepo with `apps/api` (FastAPI) and `apps/web` (Vite + React). Supabase Local CLI runs Postgres + Auth + Realtime in Docker. FastAPI verifies Supabase-issued JWTs; frontend uses Supabase JS SDK for auth flow. RLS is enabled globally on the database but no app tables exist yet — those come in Plan 2.

**Tech Stack:** Python 3.12 + FastAPI + uv (api), Node 20 + pnpm + Vite + React 18 + TypeScript + Tailwind + shadcn/ui (web), Supabase Local (Postgres 15) via CLI, Playwright for E2E.

**Prerequisites the engineer must have installed:**
- Python 3.12+
- Node 20+ and `pnpm` (`npm i -g pnpm` if missing)
- `uv` (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- Docker (Supabase Local needs it)
- Supabase CLI (`brew install supabase/tap/supabase` on macOS)

---

## File Structure

This plan creates the following files (paths relative to `/Users/alanwang/MyFiles/Project/tracker/`):

```
.editorconfig
.env.example
Makefile
README.md
supabase/
  config.toml               # supabase CLI config
  migrations/
    20260514000000_enable_rls_defaults.sql
  seed.sql

apps/api/
  pyproject.toml
  .python-version
  app/__init__.py
  app/main.py               # FastAPI app + /health
  app/core/__init__.py
  app/core/config.py        # Pydantic settings
  app/core/security.py      # JWT verification
  app/core/deps.py          # FastAPI dependencies (current_user_id)
  app/routers/__init__.py
  app/routers/me.py         # GET /me
  app/schemas/__init__.py
  app/schemas/user.py       # MeResponse Pydantic model
  tests/__init__.py
  tests/conftest.py         # fixtures: app client, fake JWT
  tests/test_health.py
  tests/test_security.py
  tests/test_me.py

apps/web/
  package.json
  pnpm-lock.yaml
  tsconfig.json
  tsconfig.node.json
  vite.config.ts
  tailwind.config.ts
  postcss.config.js
  components.json           # shadcn/ui config
  index.html
  .env.example
  src/main.tsx
  src/App.tsx
  src/index.css
  src/lib/supabase.ts       # Supabase JS client
  src/lib/auth.tsx          # AuthProvider context + useAuth hook
  src/lib/utils.ts          # shadcn/ui cn() helper
  src/api/client.ts         # axios instance + interceptors
  src/hooks/useCurrentUser.ts
  src/components/ui/button.tsx
  src/components/ui/input.tsx
  src/components/ui/label.tsx
  src/components/ui/card.tsx
  src/components/ui/sonner.tsx
  src/components/ProtectedRoute.tsx
  src/pages/Login.tsx
  src/pages/Home.tsx
  src/pages/AuthCallback.tsx
  tests/auth.spec.ts        # Playwright E2E
  playwright.config.ts
```

**File responsibilities (key ones):**
- `app/core/security.py`: JWT verification logic — pure function, easy to unit-test.
- `app/core/deps.py`: thin FastAPI dependencies that glue HTTP request to security.
- `app/routers/me.py`: HTTP handler, delegates to deps + returns Pydantic schema.
- `src/lib/auth.tsx`: single source of truth for session state in React.
- `src/api/client.ts`: single axios instance, single place for interceptors.

This split keeps HTTP, security, and business concerns separate so each can be tested in isolation.

---

## Tasks

### Task 1: Repo skeleton + base config files

**Files:**
- Create: `.editorconfig`
- Create: `.env.example`
- Create: `Makefile`
- Create: `README.md`

- [ ] **Step 1: Create `.editorconfig`**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
insert_final_newline = true
trim_trailing_whitespace = true

[*.{py}]
indent_size = 4

[*.{ts,tsx,js,jsx,json,yaml,yml,md}]
indent_size = 2

[Makefile]
indent_style = tab
```

- [ ] **Step 2: Create `.env.example`**

```bash
# Supabase Local (auto-populated by `supabase start`)
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<from `supabase status`>
SUPABASE_SERVICE_KEY=<from `supabase status`>
SUPABASE_JWT_SECRET=<from `supabase status`>

# API
API_HOST=127.0.0.1
API_PORT=8000

# Web
VITE_API_URL=http://127.0.0.1:8000
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<same as SUPABASE_ANON_KEY>
```

- [ ] **Step 3: Create `Makefile` (placeholder commands; fleshed out in Task 17)**

```makefile
.PHONY: dev test migrate seed clean

dev:
	@echo "Run 'supabase start' first, then start api and web in parallel."
	@echo "TODO: wire this up in Task 17."

test:
	@echo "TODO: wire this up in Task 17."

migrate:
	supabase db reset

seed:
	@echo "TODO: wire this up in Task 17."

clean:
	supabase stop
```

- [ ] **Step 4: Create `README.md` skeleton**

```markdown
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
```

- [ ] **Step 5: Commit**

```bash
git add .editorconfig .env.example Makefile README.md
git commit -m "feat(repo): add base config files (editorconfig, env example, makefile, readme)"
```

---

### Task 2: Initialize FastAPI backend (uv + skeleton)

**Files:**
- Create: `apps/api/pyproject.toml`
- Create: `apps/api/.python-version`
- Create: `apps/api/app/__init__.py` (empty)
- Create: `apps/api/app/main.py`
- Create: `apps/api/tests/__init__.py` (empty)
- Create: `apps/api/tests/test_health.py`

- [ ] **Step 1: Initialize uv project**

```bash
mkdir -p apps/api && cd apps/api
uv init --no-readme --no-pin-python --bare
echo "3.12" > .python-version
```

- [ ] **Step 2: Replace `apps/api/pyproject.toml`**

```toml
[project]
name = "tracker-api"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
  "fastapi>=0.110",
  "uvicorn[standard]>=0.30",
  "pydantic>=2.7",
  "pydantic-settings>=2.3",
  "python-jose[cryptography]>=3.3",
  "httpx>=0.27",
  "supabase>=2.5",
]

[dependency-groups]
dev = [
  "pytest>=8",
  "pytest-asyncio>=0.23",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"
```

- [ ] **Step 3: Install dependencies**

```bash
cd apps/api && uv sync
```

Expected: creates `.venv/` and `uv.lock`.

- [ ] **Step 4: Write failing health test**

`apps/api/tests/test_health.py`:
```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_ok():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 5: Run test, confirm it fails**

```bash
cd apps/api && uv run pytest tests/test_health.py -v
```

Expected: ImportError or ModuleNotFoundError because `app/main.py` doesn't exist yet.

- [ ] **Step 6: Write minimal FastAPI app**

`apps/api/app/main.py`:
```python
from fastapi import FastAPI

app = FastAPI(title="tracker-api")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 7: Run test, confirm it passes**

```bash
cd apps/api && uv run pytest tests/test_health.py -v
```

Expected: PASS.

- [ ] **Step 8: Verify uvicorn boots**

```bash
cd apps/api && uv run uvicorn app.main:app --port 8000 &
sleep 1 && curl http://127.0.0.1:8000/health
kill %1
```

Expected: `{"status":"ok"}`.

- [ ] **Step 9: Commit**

```bash
git add apps/api/
git commit -m "feat(api): initialize FastAPI with /health endpoint"
```

---

### Task 3: API config (Pydantic settings)

**Files:**
- Create: `apps/api/app/core/__init__.py` (empty)
- Create: `apps/api/app/core/config.py`
- Create: `apps/api/tests/test_config.py`

- [ ] **Step 1: Write failing config test**

`apps/api/tests/test_config.py`:
```python
import os

from app.core.config import Settings


def test_settings_load_from_env(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "http://test:54321")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon123")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "service123")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "secret123")

    settings = Settings()

    assert settings.supabase_url == "http://test:54321"
    assert settings.supabase_anon_key == "anon123"
    assert settings.supabase_service_key == "service123"
    assert settings.supabase_jwt_secret == "secret123"
```

- [ ] **Step 2: Run test, confirm it fails**

```bash
cd apps/api && uv run pytest tests/test_config.py -v
```

Expected: ImportError for `app.core.config`.

- [ ] **Step 3: Implement config**

`apps/api/app/core/config.py`:
```python
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    supabase_url: str
    supabase_anon_key: str
    supabase_service_key: str
    supabase_jwt_secret: str

    api_host: str = "127.0.0.1"
    api_port: int = 8000

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 4: Run test, confirm it passes**

```bash
cd apps/api && uv run pytest tests/test_config.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/core/ apps/api/tests/test_config.py
git commit -m "feat(api): add Pydantic settings for env config"
```

---

### Task 4: Initialize Supabase Local

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/20260514000000_enable_rls_defaults.sql`
- Create: `supabase/seed.sql` (empty for now)

- [ ] **Step 1: Initialize supabase in repo root**

```bash
cd /Users/alanwang/MyFiles/Project/tracker
supabase init
```

This creates `supabase/config.toml` with defaults.

- [ ] **Step 2: Verify config.toml has reasonable defaults**

Confirm the generated `supabase/config.toml` contains:
- `project_id = "tracker"` (or similar; rename if needed)
- `[api]` block with default port 54321
- `[db]` block with default port 54322
- `[auth]` block enabled

If `project_id` is missing or wrong, manually edit it to `project_id = "tracker"`.

- [ ] **Step 3: Create initial migration**

`supabase/migrations/20260514000000_enable_rls_defaults.sql`:
```sql
-- Plan 1: no app tables yet. This migration is a placeholder that confirms
-- the migration system works. Future migrations (Plan 2+) will add tables.

-- Enable required extensions for later plans
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Verify Supabase auth schema is present (it should be, set up by Supabase itself)
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'auth') then
    raise exception 'Supabase auth schema is missing; check supabase setup';
  end if;
end
$$;
```

- [ ] **Step 4: Start Supabase Local and apply migration**

```bash
supabase start
```

Expected output includes:
- `API URL: http://127.0.0.1:54321`
- `anon key: eyJ...`
- `service_role key: eyJ...`
- `JWT secret: ...`

- [ ] **Step 5: Copy values to local `.env`**

Create `.env` (do NOT commit it; `.env` is in `.gitignore`):
```bash
cp .env.example .env
# Edit .env, replace placeholders with values from `supabase status`
```

Use `supabase status` to print the values anytime.

- [ ] **Step 6: Verify migration applied**

```bash
supabase db reset  # re-applies migrations from scratch
```

Expected: completes without errors. The placeholder migration runs.

- [ ] **Step 7: Commit**

```bash
git add supabase/
git commit -m "feat(db): initialize Supabase Local with placeholder migration"
```

---

### Task 5: JWT verification (security.py)

**Files:**
- Create: `apps/api/app/core/security.py`
- Create: `apps/api/tests/test_security.py`

This task implements pure JWT verification logic, separate from FastAPI HTTP concerns.

- [ ] **Step 1: Write failing tests**

`apps/api/tests/test_security.py`:
```python
import time

import jwt as pyjwt
import pytest

from app.core.security import InvalidTokenError, verify_supabase_jwt

JWT_SECRET = "test-secret-key"


def make_token(sub: str = "user-123", exp_offset: int = 3600, **extra) -> str:
    payload = {
        "sub": sub,
        "exp": int(time.time()) + exp_offset,
        "iat": int(time.time()),
        "aud": "authenticated",
        **extra,
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")


def test_verify_valid_token_returns_user_id():
    token = make_token(sub="user-abc")
    assert verify_supabase_jwt(token, JWT_SECRET) == "user-abc"


def test_verify_expired_token_raises():
    token = make_token(exp_offset=-10)
    with pytest.raises(InvalidTokenError):
        verify_supabase_jwt(token, JWT_SECRET)


def test_verify_token_with_wrong_secret_raises():
    token = make_token()
    with pytest.raises(InvalidTokenError):
        verify_supabase_jwt(token, "wrong-secret")


def test_verify_token_without_sub_raises():
    payload = {"exp": int(time.time()) + 3600, "iat": int(time.time())}
    token = pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")
    with pytest.raises(InvalidTokenError):
        verify_supabase_jwt(token, JWT_SECRET)
```

Note: the test uses `pyjwt` directly instead of `python-jose` to keep tests independent of implementation choice.

- [ ] **Step 2: Install pyjwt as a dev-only test dep**

```bash
cd apps/api && uv add --dev pyjwt
```

- [ ] **Step 3: Run tests, confirm they fail**

```bash
cd apps/api && uv run pytest tests/test_security.py -v
```

Expected: ImportError for `app.core.security`.

- [ ] **Step 4: Implement security.py**

`apps/api/app/core/security.py`:
```python
from jose import JWTError, jwt


class InvalidTokenError(Exception):
    """Raised when JWT verification fails for any reason."""


def verify_supabase_jwt(token: str, jwt_secret: str) -> str:
    """Verify a Supabase-issued JWT and return the user_id (sub claim).

    Raises InvalidTokenError on any failure: bad signature, expired,
    missing sub, malformed.
    """
    try:
        payload = jwt.decode(
            token,
            jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except JWTError as exc:
        raise InvalidTokenError(str(exc)) from exc

    user_id = payload.get("sub")
    if not user_id:
        raise InvalidTokenError("token missing 'sub' claim")

    return user_id
```

- [ ] **Step 5: Run tests, confirm they pass**

```bash
cd apps/api && uv run pytest tests/test_security.py -v
```

Expected: all 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/app/core/security.py apps/api/tests/test_security.py apps/api/pyproject.toml apps/api/uv.lock
git commit -m "feat(api): add Supabase JWT verification"
```

---

### Task 6: FastAPI auth dependency (deps.py)

**Files:**
- Create: `apps/api/app/core/deps.py`
- Modify: `apps/api/tests/conftest.py` (create with fixtures)

- [ ] **Step 1: Create `conftest.py` with reusable fixtures**

`apps/api/tests/conftest.py`:
```python
import time

import jwt as pyjwt
import pytest
from fastapi.testclient import TestClient

from app.main import app

TEST_JWT_SECRET = "test-secret-key"


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    """Auto-applied: makes Settings load test values for every test."""
    monkeypatch.setenv("SUPABASE_URL", "http://test:54321")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon-test")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "service-test")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_JWT_SECRET)
    # clear cached settings
    from app.core.config import get_settings
    get_settings.cache_clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def make_token():
    def _make(sub: str = "user-123", exp_offset: int = 3600, **extra) -> str:
        payload = {
            "sub": sub,
            "exp": int(time.time()) + exp_offset,
            "iat": int(time.time()),
            "aud": "authenticated",
            **extra,
        }
        return pyjwt.encode(payload, TEST_JWT_SECRET, algorithm="HS256")
    return _make
```

- [ ] **Step 2: Write failing test for deps**

Add a temporary test to `apps/api/tests/test_security.py` (or new file):

`apps/api/tests/test_deps.py`:
```python
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.core.deps import get_current_user_id


def _make_app() -> FastAPI:
    app = FastAPI()

    @app.get("/whoami")
    def whoami(user_id: str = Depends(get_current_user_id)):
        return {"user_id": user_id}

    return app


def test_deps_returns_user_id_for_valid_token(make_token):
    app = _make_app()
    client = TestClient(app)
    token = make_token(sub="alice")

    response = client.get("/whoami", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json() == {"user_id": "alice"}


def test_deps_returns_401_when_no_header():
    app = _make_app()
    client = TestClient(app)

    response = client.get("/whoami")

    assert response.status_code == 401


def test_deps_returns_401_when_bad_token():
    app = _make_app()
    client = TestClient(app)

    response = client.get("/whoami", headers={"Authorization": "Bearer not-a-token"})

    assert response.status_code == 401
```

- [ ] **Step 3: Run tests, confirm they fail**

```bash
cd apps/api && uv run pytest tests/test_deps.py -v
```

Expected: ImportError for `app.core.deps`.

- [ ] **Step 4: Implement deps.py**

`apps/api/app/core/deps.py`:
```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import Settings, get_settings
from app.core.security import InvalidTokenError, verify_supabase_jwt

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user_id(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    settings: Settings = Depends(get_settings),
) -> str:
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )

    try:
        return verify_supabase_jwt(creds.credentials, settings.supabase_jwt_secret)
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc
```

- [ ] **Step 5: Run tests, confirm they pass**

```bash
cd apps/api && uv run pytest tests/test_deps.py -v
```

Expected: all 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/app/core/deps.py apps/api/tests/conftest.py apps/api/tests/test_deps.py
git commit -m "feat(api): add get_current_user_id FastAPI dependency"
```

---

### Task 7: /me endpoint

**Files:**
- Create: `apps/api/app/schemas/__init__.py` (empty)
- Create: `apps/api/app/schemas/user.py`
- Create: `apps/api/app/routers/__init__.py` (empty)
- Create: `apps/api/app/routers/me.py`
- Modify: `apps/api/app/main.py` (mount router)
- Create: `apps/api/tests/test_me.py`

- [ ] **Step 1: Write failing test for /me**

`apps/api/tests/test_me.py`:
```python
def test_me_requires_auth(client):
    response = client.get("/me")
    assert response.status_code == 401


def test_me_returns_user_info(client, make_token):
    token = make_token(sub="user-xyz", email="user@example.com")

    response = client.get("/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "user-xyz"
    # email is parsed from JWT claims for now; Plan 2 will fetch from auth.users
    assert body["email"] == "user@example.com"
    assert body["workspaces"] == []
```

- [ ] **Step 2: Run test, confirm it fails**

```bash
cd apps/api && uv run pytest tests/test_me.py -v
```

Expected: 404 because /me doesn't exist.

- [ ] **Step 3: Define Pydantic schema**

`apps/api/app/schemas/user.py`:
```python
from pydantic import BaseModel


class WorkspaceSummary(BaseModel):
    id: str
    slug: str
    name: str


class MeResponse(BaseModel):
    id: str
    email: str | None = None
    workspaces: list[WorkspaceSummary] = []
```

- [ ] **Step 4: Implement /me router**

`apps/api/app/routers/me.py`:
```python
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt

from app.core.config import Settings, get_settings
from app.core.deps import get_current_user_id
from app.schemas.user import MeResponse

router = APIRouter()

bearer_scheme = HTTPBearer(auto_error=False)


@router.get("/me", response_model=MeResponse)
def get_me(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    user_id: str = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> MeResponse:
    # Reach back into the token to extract email claim (cheap; avoids a DB
    # round-trip for now). Plan 2 will pull from auth.users via service role.
    email: str | None = None
    if creds is not None:
        try:
            payload = jwt.decode(
                creds.credentials,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
            email = payload.get("email")
        except Exception:
            # Token was already validated by get_current_user_id; if we get here,
            # something is very wrong.
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return MeResponse(id=user_id, email=email, workspaces=[])
```

- [ ] **Step 5: Mount router in main.py**

Update `apps/api/app/main.py`:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import me

app = FastAPI(title="tracker-api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(me.router)
```

- [ ] **Step 6: Run tests, confirm they pass**

```bash
cd apps/api && uv run pytest tests/test_me.py -v
```

Expected: both tests PASS.

- [ ] **Step 7: Run full test suite to make sure nothing regressed**

```bash
cd apps/api && uv run pytest -v
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/app/ apps/api/tests/test_me.py
git commit -m "feat(api): add GET /me endpoint with JWT-based user resolution"
```

---

### Task 8: Initialize Vite + React + TS frontend

**Files:**
- Create: `apps/web/` (via Vite scaffolding)

- [ ] **Step 1: Scaffold Vite project**

```bash
cd /Users/alanwang/MyFiles/Project/tracker
pnpm create vite apps/web --template react-ts
```

When prompted, accept defaults.

- [ ] **Step 2: Install dependencies**

```bash
cd apps/web && pnpm install
```

- [ ] **Step 3: Verify dev server starts**

```bash
cd apps/web && pnpm dev &
sleep 2 && curl -s http://localhost:5173 | head -5
kill %1
```

Expected: HTML containing `<title>Vite + React + TS</title>`.

- [ ] **Step 4: Configure `tsconfig.json` paths and strictness**

Edit `apps/web/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 5: Configure Vite path alias**

Replace `apps/web/vite.config.ts`:
```typescript
import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
```

- [ ] **Step 6: Verify type-check passes**

```bash
cd apps/web && pnpm tsc --noEmit
```

Expected: no output (success).

- [ ] **Step 7: Commit**

```bash
git add apps/web/
git commit -m "feat(web): scaffold Vite + React + TypeScript project"
```

---

### Task 9: Tailwind CSS setup

**Files:**
- Modify: `apps/web/package.json` (adds Tailwind deps)
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.js`
- Modify: `apps/web/src/index.css`

- [ ] **Step 1: Install Tailwind and tooling**

```bash
cd apps/web && pnpm add -D tailwindcss@^3.4 postcss autoprefixer
pnpm dlx tailwindcss init -p
```

Note: pin to Tailwind v3.4. Tailwind v4 has different config syntax; use v4 only if comfortable with breaking changes.

- [ ] **Step 2: Configure `tailwind.config.ts`**

Replace `apps/web/tailwind.config.js` with `apps/web/tailwind.config.ts`:
```typescript
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
```

Delete the old `.js` file if Tailwind created one.

- [ ] **Step 3: Replace `apps/web/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: Update `apps/web/src/App.tsx` to verify Tailwind works**

```tsx
function App() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <h1 className="text-3xl font-bold text-slate-900">tracker</h1>
    </div>
  );
}

export default App;
```

- [ ] **Step 5: Run dev server and visually verify**

```bash
cd apps/web && pnpm dev
```

Open http://localhost:5173 in browser. Expect: "tracker" header centered on slate-50 background. Kill dev server (`Ctrl+C`) after confirming.

- [ ] **Step 6: Commit**

```bash
git add apps/web/
git commit -m "feat(web): set up Tailwind CSS"
```

---

### Task 10: shadcn/ui initialization

**Files:**
- Create: `apps/web/components.json`
- Create: `apps/web/src/lib/utils.ts`
- Create: `apps/web/src/components/ui/{button,input,label,card,sonner}.tsx` (via CLI)

- [ ] **Step 1: Run shadcn init**

```bash
cd apps/web && pnpm dlx shadcn@latest init
```

Answer the prompts:
- Style: Default
- Base color: Slate
- CSS variables: Yes

This creates `components.json`, updates `tailwind.config.ts` with CSS variables, and creates `src/lib/utils.ts`.

- [ ] **Step 2: Install initial UI components**

```bash
cd apps/web && pnpm dlx shadcn@latest add button input label card sonner
```

This adds `src/components/ui/` files.

- [ ] **Step 3: Verify type-check passes**

```bash
cd apps/web && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Update `App.tsx` to use shadcn Button**

```tsx
import { Button } from "@/components/ui/button";

function App() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-3xl font-bold text-slate-900">tracker</h1>
        <Button>Hello</Button>
      </div>
    </div>
  );
}

export default App;
```

- [ ] **Step 5: Run dev server, verify shadcn button renders**

```bash
cd apps/web && pnpm dev
```

Open http://localhost:5173. Expect: "tracker" header with a styled button beneath. Kill dev server.

- [ ] **Step 6: Commit**

```bash
git add apps/web/
git commit -m "feat(web): set up shadcn/ui with initial components"
```

---

### Task 11: React Router setup

**Files:**
- Modify: `apps/web/package.json` (adds react-router-dom)
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/App.tsx`
- Create: `apps/web/src/pages/Login.tsx` (placeholder)
- Create: `apps/web/src/pages/Home.tsx` (placeholder)
- Create: `apps/web/src/pages/AuthCallback.tsx` (placeholder)

- [ ] **Step 1: Install react-router-dom**

```bash
cd apps/web && pnpm add react-router-dom
```

- [ ] **Step 2: Create placeholder pages**

`apps/web/src/pages/Login.tsx`:
```tsx
export default function Login() {
  return <div className="p-8">Login (placeholder)</div>;
}
```

`apps/web/src/pages/Home.tsx`:
```tsx
export default function Home() {
  return <div className="p-8">Home (placeholder)</div>;
}
```

`apps/web/src/pages/AuthCallback.tsx`:
```tsx
export default function AuthCallback() {
  return <div className="p-8">Signing you in…</div>;
}
```

- [ ] **Step 3: Replace `App.tsx` with routes**

```tsx
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import AuthCallback from "@/pages/AuthCallback";
import Home from "@/pages/Home";
import Login from "@/pages/Login";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/" element={<Home />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 4: Verify routes work**

```bash
cd apps/web && pnpm dev
```

Open http://localhost:5173/login → expect "Login (placeholder)".
Open http://localhost:5173/ → expect "Home (placeholder)".
Open http://localhost:5173/anything → expect redirect to "/".
Kill dev server.

- [ ] **Step 5: Commit**

```bash
git add apps/web/
git commit -m "feat(web): set up React Router with placeholder pages"
```

---

### Task 12: Supabase client + AuthProvider

**Files:**
- Modify: `apps/web/package.json` (adds @supabase/supabase-js)
- Create: `apps/web/src/lib/supabase.ts`
- Create: `apps/web/src/lib/auth.tsx`
- Create: `apps/web/.env.example`
- Modify: `apps/web/src/main.tsx` (wrap with AuthProvider)

- [ ] **Step 1: Install supabase-js**

```bash
cd apps/web && pnpm add @supabase/supabase-js
```

- [ ] **Step 2: Create `apps/web/.env.example`**

```bash
VITE_API_URL=http://127.0.0.1:8000
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<from supabase status>
```

Tell the engineer to copy this to `.env.local` and fill in the anon key.

- [ ] **Step 3: Create supabase client**

`apps/web/src/lib/supabase.ts`:
```typescript
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local",
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
```

- [ ] **Step 4: Create AuthProvider**

`apps/web/src/lib/auth.tsx`:
```tsx
import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, loading }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
```

- [ ] **Step 5: Wrap App with AuthProvider in `main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App.tsx";
import "./index.css";
import { AuthProvider } from "@/lib/auth";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 6: Verify type-check and dev server**

```bash
cd apps/web && pnpm tsc --noEmit && pnpm dev
```

Open http://localhost:5173/. Expect "Home (placeholder)" still renders (auth is wired but pages don't use it yet). Kill dev server.

- [ ] **Step 7: Commit**

```bash
git add apps/web/
git commit -m "feat(web): add Supabase client and AuthProvider context"
```

---

### Task 13: Login page (email/password + Google OAuth)

**Files:**
- Modify: `apps/web/src/pages/Login.tsx`
- Modify: `apps/web/src/pages/AuthCallback.tsx`

- [ ] **Step 1: Implement Login page**

Replace `apps/web/src/pages/Login.tsx`:
```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const op =
        mode === "signin"
          ? supabase.auth.signInWithPassword({ email, password })
          : supabase.auth.signUp({ email, password });
      const { error } = await op;
      if (error) {
        toast.error(error.message);
        return;
      }
      navigate("/");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) toast.error(error.message);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            {mode === "signin" ? "Sign in to tracker" : "Create an account"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting
                ? "…"
                : mode === "signin"
                  ? "Sign in"
                  : "Sign up"}
            </Button>
          </form>
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>
          <Button variant="outline" className="w-full" onClick={handleGoogle}>
            Continue with Google
          </Button>
        </CardContent>
        <CardFooter className="flex justify-center text-sm">
          <button
            type="button"
            className="text-muted-foreground hover:underline"
            onClick={() =>
              setMode((m) => (m === "signin" ? "signup" : "signin"))
            }
          >
            {mode === "signin"
              ? "No account? Sign up"
              : "Have an account? Sign in"}
          </button>
        </CardFooter>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Implement AuthCallback page**

Replace `apps/web/src/pages/AuthCallback.tsx`:
```tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { supabase } from "@/lib/supabase";

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    // detectSessionInUrl (configured in supabase client) parses the URL fragment
    // automatically. We just wait for the session to settle then redirect.
    const sub = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        navigate("/", { replace: true });
      }
    });

    // Edge case: already signed in (page reload).
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/", { replace: true });
    });

    return () => sub.data.subscription.unsubscribe();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p>Signing you in…</p>
    </div>
  );
}
```

- [ ] **Step 3: Mount Toaster (sonner) in main.tsx**

Update `apps/web/src/main.tsx`:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App.tsx";
import "./index.css";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
      <Toaster />
    </AuthProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 4: Manual smoke test (sign up + sign in)**

```bash
cd apps/web && pnpm dev
```

In browser:
1. Open http://localhost:5173/login.
2. Switch to "Sign up", create a new account (e.g., `alan@example.com` / `password123`).
3. After redirect to `/`, you should see "Home (placeholder)" (Task 14 will make this useful).
4. Reload — session should persist.
5. Open dev tools → Application → IndexedDB / LocalStorage — confirm a Supabase session is stored.

Kill dev server.

- [ ] **Step 5: Commit**

```bash
git add apps/web/
git commit -m "feat(web): implement login page with email/password + Google OAuth"
```

---

### Task 14: ProtectedRoute + Home page (calls /me)

**Files:**
- Modify: `apps/web/package.json` (adds axios, @tanstack/react-query)
- Create: `apps/web/src/api/client.ts`
- Create: `apps/web/src/hooks/useCurrentUser.ts`
- Create: `apps/web/src/components/ProtectedRoute.tsx`
- Modify: `apps/web/src/pages/Home.tsx`
- Modify: `apps/web/src/main.tsx` (add QueryClientProvider)
- Modify: `apps/web/src/App.tsx` (wrap Home with ProtectedRoute)

- [ ] **Step 1: Install axios + React Query**

```bash
cd apps/web && pnpm add axios @tanstack/react-query
```

- [ ] **Step 2: Create axios client with auth interceptor**

`apps/web/src/api/client.ts`:
```typescript
import axios from "axios";

import { supabase } from "@/lib/supabase";

const baseURL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export const apiClient = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && !error.config.__retry) {
      error.config.__retry = true;
      const { data, error: refreshErr } =
        await supabase.auth.refreshSession();
      if (!refreshErr && data.session) {
        return apiClient.request(error.config);
      }
      // Refresh failed; route user back to login.
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);
```

- [ ] **Step 3: Create useCurrentUser hook**

`apps/web/src/hooks/useCurrentUser.ts`:
```typescript
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/api/client";

export type Me = {
  id: string;
  email: string | null;
  workspaces: { id: string; slug: string; name: string }[];
};

export function useCurrentUser() {
  return useQuery<Me>({
    queryKey: ["me"],
    queryFn: async () => {
      const { data } = await apiClient.get<Me>("/me");
      return data;
    },
    staleTime: 1000 * 60 * 5, // 5 min
  });
}
```

- [ ] **Step 4: Create ProtectedRoute**

`apps/web/src/components/ProtectedRoute.tsx`:
```tsx
import { Navigate } from "react-router-dom";

import { useAuth } from "@/lib/auth";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading…</p>
      </div>
    );
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
```

- [ ] **Step 5: Implement Home page**

Replace `apps/web/src/pages/Home.tsx`:
```tsx
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const { data: me, isLoading, error } = useCurrentUser();

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) toast.error(error.message);
    // AuthProvider's onAuthStateChange clears session; ProtectedRoute redirects.
  }

  return (
    <div className="min-h-screen p-8 bg-slate-50">
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Welcome to tracker</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && <p>Loading…</p>}
          {error && (
            <p className="text-red-600">Failed to load profile: {error.message}</p>
          )}
          {me && (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Signed in as</p>
              <p className="font-medium">{me.email ?? me.id}</p>
            </div>
          )}
          <Button onClick={handleSignOut} variant="outline" className="w-full">
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: Add QueryClientProvider in main.tsx**

Update `apps/web/src/main.tsx`:
```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App.tsx";
import "./index.css";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 7: Wrap Home with ProtectedRoute in App.tsx**

Update `apps/web/src/App.tsx`:
```tsx
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import AuthCallback from "@/pages/AuthCallback";
import Home from "@/pages/Home";
import Login from "@/pages/Login";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 8: Full smoke test**

Start the API:
```bash
cd apps/api && uv run uvicorn app.main:app --port 8000 --reload
```

In another terminal, start the web:
```bash
cd apps/web && pnpm dev
```

Browser:
1. Open http://localhost:5173/ → redirects to `/login` (no session).
2. Sign in with the user created in Task 13.
3. Redirects to `/` → shows "Signed in as <your email>".
4. Open Network tab — confirm a `GET /me` request with `Authorization: Bearer ...` header returned 200.
5. Click "Sign out" → redirects back to `/login`.

If `/me` returns 401, double-check `SUPABASE_JWT_SECRET` matches between `apps/api/.env` and what `supabase status` prints.

Kill both servers.

- [ ] **Step 9: Commit**

```bash
git add apps/web/
git commit -m "feat(web): wire up /me with axios + React Query, protected home page"
```

---

### Task 15: Playwright E2E test for auth flow

**Files:**
- Modify: `apps/web/package.json` (adds @playwright/test)
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/tests/auth.spec.ts`

- [ ] **Step 1: Install Playwright**

```bash
cd apps/web && pnpm add -D @playwright/test
pnpm dlx playwright install chromium
```

- [ ] **Step 2: Create `playwright.config.ts`**

```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "cd ../api && uv run uvicorn app.main:app --port 8000",
      port: 8000,
      reuseExistingServer: true,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "pnpm dev",
      port: 5173,
      reuseExistingServer: true,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
```

- [ ] **Step 3: Write E2E test**

`apps/web/tests/auth.spec.ts`:
```typescript
import { expect, test } from "@playwright/test";

const TEST_EMAIL = `e2e+${Date.now()}@example.com`;
const TEST_PASSWORD = "test-password-123";

test.describe.serial("auth flow", () => {
  test("sign up creates account and signs the user in", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);

    await page.getByRole("button", { name: /no account/i }).click();
    await page.getByLabel(/email/i).fill(TEST_EMAIL);
    await page.getByLabel(/password/i).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign up/i }).click();

    await page.waitForURL("/");
    await expect(page.getByText(TEST_EMAIL)).toBeVisible({ timeout: 10_000 });
  });

  test("sign out returns to login page", async ({ page }) => {
    await page.goto("/");
    // The previous test signed us in; session is shared via local storage.
    // If running in isolation, this test would need its own setup.

    await page.getByRole("button", { name: /sign out/i }).click();
    await page.waitForURL("/login");
    await expect(page.getByText(/sign in to tracker/i)).toBeVisible();
  });
});
```

Note: this test depends on Supabase Local accepting unverified emails. Confirm `supabase/config.toml` has `[auth] enable_confirmations = false` (default). If true, sign-up will require email verification — change it to false for testing.

- [ ] **Step 4: Run Playwright test**

```bash
cd apps/web && pnpm exec playwright test
```

Expected: both tests PASS. (If they fail, check the dev server is reachable, env vars are set, Supabase Local is running.)

- [ ] **Step 5: Add `test:e2e` script to `apps/web/package.json`**

In the `scripts` block of `apps/web/package.json`, add:
```json
"test:e2e": "playwright test"
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/
git commit -m "test(web): add Playwright E2E test for auth flow"
```

---

### Task 16: Wire up the Makefile

**Files:**
- Modify: `Makefile`
- Modify: `README.md` (expand Setup section)

- [ ] **Step 1: Write proper Makefile**

Replace `Makefile`:
```makefile
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
	  echo "supabase/seed.sql is empty; nothing to seed."; \
	fi

clean:
	supabase stop

db-status:
	supabase status
```

- [ ] **Step 2: Expand README setup section**

Replace the Setup section in `README.md`:
```markdown
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
```

- [ ] **Step 3: Verify `make dev` works**

```bash
make clean    # if previously running
make dev
```

In another terminal:
```bash
curl http://127.0.0.1:8000/health     # expect {"status":"ok"}
curl http://127.0.0.1:5173 | head -3  # expect HTML
```

Stop with `Ctrl+C`. Run `make clean` to stop Supabase.

- [ ] **Step 4: Verify `make test` runs full suite**

```bash
make test
```

Expected: api pytest passes, web tsc passes.

- [ ] **Step 5: Commit**

```bash
git add Makefile README.md
git commit -m "feat(repo): wire up Makefile with dev/test/migrate targets"
```

---

### Task 17: Final polish — confirm clean state

**Files:**
- Modify: `.gitignore` (add anything missing)
- Verify: full test suite passes cleanly

- [ ] **Step 1: Audit `.gitignore`**

Confirm `.gitignore` includes:
- `node_modules/`, `__pycache__/`, `*.pyc`, `.venv/`
- `dist/`, `build/`
- `.env`, `.env.local`, `.env.*.local`
- `.DS_Store`, `*.swp`, `.vscode/`, `.idea/`
- `supabase/.branches/`, `supabase/.temp/`
- `test-results/`, `playwright-report/`, `playwright/.cache/`

If any are missing, add them.

- [ ] **Step 2: Verify no secrets are committed**

```bash
git ls-files | xargs grep -l "supabase_jwt_secret\|service_role_key" 2>/dev/null || echo "no secrets in tracked files"
```

Expected: `no secrets in tracked files`. Inspect any matches; the only acceptable occurrences are in comments/docs/example files explicitly marked as placeholders.

- [ ] **Step 3: Full test run from clean state**

```bash
make clean
supabase start
make test
make test-e2e
```

Expected: everything passes.

- [ ] **Step 4: Commit any final fixups**

```bash
git add -A
git commit -m "chore: final cleanup for Plan 1 (Foundation + Auth)" || echo "nothing to commit"
```

---

## Done When

- [ ] All 17 tasks complete and committed.
- [ ] `make dev` brings up Supabase + api + web with no errors.
- [ ] Browser flow: visit `/` → redirect to `/login` → sign up → land on `/` → see your email → sign out → return to `/login`.
- [ ] `make test` passes (api pytest + web tsc).
- [ ] `make test-e2e` passes (Playwright auth flow).
- [ ] `supabase db reset` succeeds, applying the placeholder migration.
- [ ] No secrets in git history.

## What's Next

Plan 2: **Workspaces + Projects CRUD**
- Add `workspaces`, `workspace_members`, `projects` tables with RLS.
- Add CRUD endpoints + onboarding flow.
- After Plan 2, you'll be able to create workspaces, invite members, and create projects.
