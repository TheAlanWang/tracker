# Workspaces + Projects CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user can sign in, get routed to onboarding if they have no workspace, create a workspace, create a project inside it, and see them listed. Members table exists with the user auto-inserted as owner; member CRUD endpoints exist for later UI.

**Architecture:** Backend exposes `workspaces`, `workspace_members`, `projects` resources via FastAPI. Backend uses Supabase service-role client and enforces ownership explicitly in services; RLS policies are defined as defense-in-depth. Frontend gains `/onboarding`, `/w` (workspace picker), `/w/:wsSlug` (workspace home, project list), and updated routing that redirects users without workspaces to `/onboarding`.

**Tech Stack:** Same as Plan 1 — FastAPI + Supabase (Postgres) + Vite + React + shadcn/ui.

**Conventions established here that Plan 3+ will reuse:**
- Backend pattern: `routers/<resource>.py` (thin) → `services/<resource>.py` (business) → `db/supabase.py` (client). Services accept `user_id` and explicitly check ownership.
- RLS pattern: every table has SELECT/INSERT/UPDATE/DELETE policies based on membership in `workspace_members`.
- Test pattern: services tested with mocked supabase client; routers tested via TestClient with deps overridden.
- Frontend pattern: `features/<resource>/` directory with `api.ts` (queries/mutations), `<Resource>List.tsx`, `<Resource>Form.tsx`.

---

## File Structure

This plan creates / modifies (paths relative to `/Users/alanwang/MyFiles/Project/tracker/`):

```
backend/
  app/
    db/
      __init__.py
      supabase.py                  # NEW: service-role client factory
    schemas/
      workspace.py                 # NEW
      project.py                   # NEW
      member.py                    # NEW
      user.py                      # MODIFIED: workspaces field populated for real
    services/
      __init__.py                  # NEW (empty)
      workspaces.py                # NEW
      projects.py                  # NEW
      members.py                   # NEW
    routers/
      workspaces.py                # NEW
      projects.py                  # NEW
      members.py                   # NEW
      me.py                        # MODIFIED: real workspaces lookup
    core/
      deps.py                      # MODIFIED: add get_supabase_admin dep
    main.py                        # MODIFIED: mount new routers
  tests/
    test_workspaces_service.py     # NEW
    test_workspaces_router.py      # NEW
    test_projects_service.py       # NEW
    test_projects_router.py        # NEW
    test_members_router.py         # NEW
    test_me.py                     # MODIFIED: test real workspace lookup

supabase/
  migrations/
    20260515000000_workspaces_projects.sql  # NEW

frontend/
  src/
    features/
      workspaces/                  # NEW
        api.ts                     # React Query hooks
        WorkspaceForm.tsx          # used by onboarding + settings
        WorkspaceSwitcher.tsx      # sidebar dropdown
      projects/                    # NEW
        api.ts
        ProjectForm.tsx
        ProjectList.tsx
    components/
      WorkspaceLayout.tsx          # NEW: sidebar + content
    pages/
      Onboarding.tsx               # NEW
      WorkspacePicker.tsx          # NEW (was Home.tsx for /w route)
      WorkspaceHome.tsx            # NEW (renders project list)
      Home.tsx                     # MODIFIED: routes to picker or onboarding
    App.tsx                        # MODIFIED: new routes
  tests/
    workspace.spec.ts              # NEW: E2E for workspace creation
```

**File responsibilities:**

- `db/supabase.py`: ONE place that creates the supabase admin client. Reading the service-role key from settings. Cached.
- `services/<resource>.py`: pure business logic, takes `user_id` as a parameter, queries supabase, returns Pydantic models or raises domain errors. NO HTTP, NO FastAPI imports.
- `routers/<resource>.py`: HTTP layer — request parsing, call service, return response. Catches domain errors and converts to HTTPException.
- `features/<resource>/api.ts`: React Query `useQuery` / `useMutation` hooks, one per endpoint.
- `WorkspaceLayout.tsx`: a route layout component that renders the sidebar + nested route content. Used by all `/w/:wsSlug/*` routes.

---

## Tasks

### Task 1: Database migration — workspaces, workspace_members, projects + RLS

**Files:**
- Create: `supabase/migrations/20260515000000_workspaces_projects.sql`

This migration creates the three tables, sets up indexes, enables RLS, and defines policies. After Plan 2 it should be possible to drop and recreate the DB cleanly with `supabase db reset`.

- [ ] **Step 1: Write the migration**

`supabase/migrations/20260515000000_workspaces_projects.sql`:
```sql
-- Workspaces, members, projects.
-- RLS is defense-in-depth; the FastAPI service layer also enforces ownership.

-- ─── Enums ───
create type workspace_member_role as enum ('owner', 'admin', 'member');

-- ─── workspaces ───
create table workspaces (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workspaces_owner_id_idx on workspaces (owner_id);

-- ─── workspace_members ───
create table workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role workspace_member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_id_idx on workspace_members (user_id);

-- ─── projects ───
create table projects (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  key text not null,
  next_issue_number int not null default 1,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, key)
);

create index projects_workspace_id_idx on projects (workspace_id);

-- ─── updated_at triggers ───
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger workspaces_set_updated_at
  before update on workspaces
  for each row execute function set_updated_at();

create trigger projects_set_updated_at
  before update on projects
  for each row execute function set_updated_at();

-- ─── RLS ───
alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table projects enable row level security;

-- Helper: is the current auth.uid() a member of this workspace?
create or replace function is_workspace_member(ws_id uuid)
returns boolean as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = ws_id and user_id = auth.uid()
  );
$$ language sql security definer set search_path = public;

-- workspaces policies
create policy "members can read their workspaces"
  on workspaces for select
  using (is_workspace_member(id));

create policy "owners can update their workspaces"
  on workspaces for update
  using (owner_id = auth.uid());

create policy "owners can delete their workspaces"
  on workspaces for delete
  using (owner_id = auth.uid());

create policy "authenticated users can create workspaces"
  on workspaces for insert
  with check (owner_id = auth.uid());

-- workspace_members policies
create policy "members can read membership rows for their workspaces"
  on workspace_members for select
  using (is_workspace_member(workspace_id));

create policy "owners and admins can insert members"
  on workspace_members for insert
  with check (
    exists (
      select 1 from workspace_members
      where workspace_id = workspace_members.workspace_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
    or
    -- bootstrapping: the workspace owner inserts themselves as the first member
    (user_id = auth.uid()
     and exists (
       select 1 from workspaces
       where id = workspace_members.workspace_id and owner_id = auth.uid()
     ))
  );

create policy "owners and admins can update member roles"
  on workspace_members for update
  using (
    exists (
      select 1 from workspace_members
      where workspace_id = workspace_members.workspace_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

create policy "owners and admins can remove members"
  on workspace_members for delete
  using (
    exists (
      select 1 from workspace_members
      where workspace_id = workspace_members.workspace_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- projects policies
create policy "members can read workspace projects"
  on projects for select
  using (is_workspace_member(workspace_id));

create policy "members can insert workspace projects"
  on projects for insert
  with check (is_workspace_member(workspace_id));

create policy "members can update workspace projects"
  on projects for update
  using (is_workspace_member(workspace_id));

create policy "members can delete workspace projects"
  on projects for delete
  using (is_workspace_member(workspace_id));
```

- [ ] **Step 2: Apply migration**

```bash
cd /Users/alanwang/MyFiles/Project/tracker && supabase db reset
```

Expected: all migrations apply cleanly. Output ends with "Database reset successfully."

- [ ] **Step 3: Smoke test the schema via psql**

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "
  select table_name from information_schema.tables
  where table_schema='public' and table_name in ('workspaces','workspace_members','projects');
"
```

Expected: 3 rows.

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "
  select policyname from pg_policies
  where schemaname='public' and tablename='workspaces';
"
```

Expected: 4 policies (read/insert/update/delete).

- [ ] **Step 4: Commit**

```bash
cd /Users/alanwang/MyFiles/Project/tracker
git add supabase/migrations/
git commit -m "feat(db): add workspaces, workspace_members, projects tables with RLS"
```

---

### Task 2: Backend — supabase admin client wrapper

**Files:**
- Create: `backend/app/db/__init__.py` (empty)
- Create: `backend/app/db/supabase.py`
- Create: `backend/tests/test_supabase_client.py`

- [ ] **Step 1: Write failing test**

`backend/tests/test_supabase_client.py`:
```python
from app.db.supabase import get_supabase_admin


def test_get_supabase_admin_returns_cached_client():
    client1 = get_supabase_admin()
    client2 = get_supabase_admin()
    assert client1 is client2  # cached


def test_get_supabase_admin_uses_service_key(monkeypatch):
    # Reset cache to pick up new env
    get_supabase_admin.cache_clear()
    monkeypatch.setenv("SUPABASE_URL", "http://other:54321")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "different-service-key")
    from app.core.config import get_settings
    get_settings.cache_clear()

    client = get_supabase_admin()
    # We can't easily introspect the client's auth, so just confirm it instantiated.
    assert client is not None
```

- [ ] **Step 2: Run test, confirm fails**

```bash
cd /Users/alanwang/MyFiles/Project/tracker/backend && uv run pytest tests/test_supabase_client.py -v
```

Expected: ImportError.

- [ ] **Step 3: Implement `db/supabase.py`**

`backend/app/db/supabase.py`:
```python
from functools import lru_cache

from supabase import Client, create_client

from app.core.config import get_settings


@lru_cache
def get_supabase_admin() -> Client:
    """Return a cached Supabase client authenticated as service_role.

    This client BYPASSES RLS — use carefully in service layer code that
    explicitly checks ownership.
    """
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_key)
```

- [ ] **Step 4: Run test, confirm passes**

```bash
cd /Users/alanwang/MyFiles/Project/tracker/backend && uv run pytest tests/test_supabase_client.py -v
```

Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/alanwang/MyFiles/Project/tracker
git add backend/app/db/ backend/tests/test_supabase_client.py
git commit -m "feat(api): add Supabase admin client wrapper"
```

---

### Task 3: Backend — workspace + member + project Pydantic schemas

**Files:**
- Create: `backend/app/schemas/workspace.py`
- Create: `backend/app/schemas/project.py`
- Create: `backend/app/schemas/member.py`

No tests for this task — schemas are validated implicitly by router/service tests.

- [ ] **Step 1: Create `schemas/workspace.py`**

```python
from datetime import datetime

from pydantic import BaseModel, Field


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    slug: str = Field(min_length=2, max_length=50, pattern=r"^[a-z0-9-]+$")


class WorkspaceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)


class WorkspaceResponse(BaseModel):
    id: str
    name: str
    slug: str
    owner_id: str
    created_at: datetime
    updated_at: datetime
```

- [ ] **Step 2: Create `schemas/project.py`**

```python
from datetime import datetime

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    key: str = Field(min_length=2, max_length=10, pattern=r"^[A-Z][A-Z0-9]*$")
    description: str | None = Field(default=None, max_length=1000)


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=1000)


class ProjectResponse(BaseModel):
    id: str
    workspace_id: str
    name: str
    key: str
    next_issue_number: int
    description: str | None
    created_at: datetime
    updated_at: datetime
```

- [ ] **Step 3: Create `schemas/member.py`**

```python
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


WorkspaceRole = Literal["owner", "admin", "member"]


class MemberInvite(BaseModel):
    email: str
    role: WorkspaceRole = "member"


class MemberRoleUpdate(BaseModel):
    role: WorkspaceRole


class MemberResponse(BaseModel):
    user_id: str
    workspace_id: str
    role: WorkspaceRole
    created_at: datetime
```

- [ ] **Step 4: Verify schemas import cleanly**

```bash
cd /Users/alanwang/MyFiles/Project/tracker/backend && uv run python -c "from app.schemas.workspace import WorkspaceCreate; from app.schemas.project import ProjectCreate; from app.schemas.member import MemberInvite; print('ok')"
```

Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
cd /Users/alanwang/MyFiles/Project/tracker
git add backend/app/schemas/
git commit -m "feat(api): add workspace, project, member Pydantic schemas"
```

---

### Task 4: Backend — workspaces service (TDD)

**Files:**
- Create: `backend/app/services/__init__.py` (empty)
- Create: `backend/app/services/workspaces.py`
- Create: `backend/tests/test_workspaces_service.py`

This task establishes the **service layer pattern** for all of Plan 2-11.

- [ ] **Step 1: Write failing tests**

`backend/tests/test_workspaces_service.py`:
```python
from unittest.mock import MagicMock

import pytest

from app.schemas.workspace import WorkspaceCreate
from app.services.workspaces import (
    WorkspaceNotFoundError,
    WorkspacePermissionError,
    WorkspaceSlugExistsError,
    create_workspace,
    delete_workspace,
    get_workspace,
    list_workspaces_for_user,
    update_workspace,
)


def _fake_workspace_row(**overrides):
    base = {
        "id": "ws-1",
        "name": "Engineering",
        "slug": "eng",
        "owner_id": "user-1",
        "created_at": "2026-05-14T00:00:00Z",
        "updated_at": "2026-05-14T00:00:00Z",
    }
    base.update(overrides)
    return base


@pytest.fixture
def mock_supabase():
    """Returns a deeply-mocked supabase client. Use chain helpers below."""
    return MagicMock()


def test_create_workspace_inserts_and_adds_owner_member(mock_supabase):
    payload = WorkspaceCreate(name="Engineering", slug="eng")

    # supabase.table("workspaces").insert(...).execute() returns the new row
    mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [
        _fake_workspace_row()
    ]

    result = create_workspace(mock_supabase, user_id="user-1", payload=payload)

    assert result.id == "ws-1"
    assert result.slug == "eng"
    # Workspace insert + member insert = 2 table accesses
    assert mock_supabase.table.call_count >= 2
    # Verify member row insert
    member_calls = [
        call for call in mock_supabase.table.call_args_list
        if call.args[0] == "workspace_members"
    ]
    assert len(member_calls) == 1


def test_create_workspace_duplicate_slug_raises(mock_supabase):
    payload = WorkspaceCreate(name="X", slug="taken")
    from postgrest.exceptions import APIError
    mock_supabase.table.return_value.insert.return_value.execute.side_effect = APIError(
        {"code": "23505", "message": "duplicate key value", "details": "Key (slug)=(taken) already exists."}
    )

    with pytest.raises(WorkspaceSlugExistsError):
        create_workspace(mock_supabase, user_id="user-1", payload=payload)


def test_get_workspace_returns_workspace_if_member(mock_supabase):
    # Membership check returns 1 row
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"role": "member"}
    ]
    # Workspace fetch returns the workspace
    fetch_chain = MagicMock()
    fetch_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _fake_workspace_row()
    mock_supabase.table.side_effect = lambda name: (
        MagicMock(select=MagicMock(return_value=MagicMock(
            eq=MagicMock(return_value=MagicMock(
                eq=MagicMock(return_value=MagicMock(
                    execute=MagicMock(return_value=MagicMock(data=[{"role": "member"}]))
                )),
                single=MagicMock(return_value=MagicMock(
                    execute=MagicMock(return_value=MagicMock(data=_fake_workspace_row()))
                )),
            ))
        ))) if name in ("workspace_members", "workspaces") else MagicMock()
    )

    result = get_workspace(mock_supabase, user_id="user-1", workspace_id="ws-1")
    assert result.id == "ws-1"


def test_get_workspace_not_member_raises_permission(mock_supabase):
    # Membership check returns empty
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []

    with pytest.raises(WorkspacePermissionError):
        get_workspace(mock_supabase, user_id="user-1", workspace_id="ws-1")


def test_list_workspaces_for_user_returns_users_workspaces(mock_supabase):
    # Membership query returns list of workspace_ids
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {"workspace_id": "ws-1"},
        {"workspace_id": "ws-2"},
    ]
    # Workspaces lookup returns 2 rows
    # The order of chained calls makes mocking precisely hard; here we set up an alternate path:
    workspaces_query = MagicMock()
    workspaces_query.select.return_value.in_.return_value.execute.return_value.data = [
        _fake_workspace_row(id="ws-1", slug="a"),
        _fake_workspace_row(id="ws-2", slug="b"),
    ]
    def table_router(name):
        if name == "workspace_members":
            return mock_supabase.table.return_value
        if name == "workspaces":
            return workspaces_query
        raise AssertionError(f"unexpected table: {name}")
    mock_supabase.table.side_effect = table_router

    result = list_workspaces_for_user(mock_supabase, user_id="user-1")
    assert len(result) == 2
    assert {w.slug for w in result} == {"a", "b"}


def test_list_workspaces_for_user_empty(mock_supabase):
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
    result = list_workspaces_for_user(mock_supabase, user_id="user-1")
    assert result == []


def test_update_workspace_owner_only(mock_supabase):
    # Workspace lookup returns the workspace owned by another user
    mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _fake_workspace_row(owner_id="other-user")

    from app.schemas.workspace import WorkspaceUpdate
    with pytest.raises(WorkspacePermissionError):
        update_workspace(
            mock_supabase, user_id="user-1", workspace_id="ws-1",
            payload=WorkspaceUpdate(name="New name"),
        )


def test_delete_workspace_owner_only(mock_supabase):
    mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _fake_workspace_row(owner_id="other-user")

    with pytest.raises(WorkspacePermissionError):
        delete_workspace(mock_supabase, user_id="user-1", workspace_id="ws-1")
```

- [ ] **Step 2: Run tests, confirm fail**

```bash
cd /Users/alanwang/MyFiles/Project/tracker/backend && uv run pytest tests/test_workspaces_service.py -v
```

Expected: ImportError or all 8 tests fail.

- [ ] **Step 3: Implement `services/workspaces.py`**

`backend/app/services/workspaces.py`:
```python
"""Workspace business logic.

Service functions take an admin Supabase client and the acting user_id, then
perform explicit ownership / membership checks. The service layer is the
authoritative gate; RLS policies are defense-in-depth.
"""

from postgrest.exceptions import APIError
from supabase import Client

from app.schemas.workspace import (
    WorkspaceCreate,
    WorkspaceResponse,
    WorkspaceUpdate,
)


class WorkspaceError(Exception):
    """Base class for workspace domain errors."""


class WorkspaceNotFoundError(WorkspaceError):
    pass


class WorkspacePermissionError(WorkspaceError):
    pass


class WorkspaceSlugExistsError(WorkspaceError):
    pass


def _is_member(supabase: Client, *, user_id: str, workspace_id: str) -> bool:
    rows = (
        supabase.table("workspace_members")
        .select("role")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .execute()
        .data
    )
    return bool(rows)


def create_workspace(
    supabase: Client, *, user_id: str, payload: WorkspaceCreate
) -> WorkspaceResponse:
    try:
        result = (
            supabase.table("workspaces")
            .insert(
                {"name": payload.name, "slug": payload.slug, "owner_id": user_id}
            )
            .execute()
        )
    except APIError as exc:
        if "duplicate key" in str(exc).lower() or "23505" in str(exc):
            raise WorkspaceSlugExistsError(payload.slug) from exc
        raise

    workspace = result.data[0]

    # Auto-insert the owner as a member with role=owner
    supabase.table("workspace_members").insert(
        {"workspace_id": workspace["id"], "user_id": user_id, "role": "owner"}
    ).execute()

    return WorkspaceResponse(**workspace)


def get_workspace(
    supabase: Client, *, user_id: str, workspace_id: str
) -> WorkspaceResponse:
    if not _is_member(supabase, user_id=user_id, workspace_id=workspace_id):
        raise WorkspacePermissionError(workspace_id)

    row = (
        supabase.table("workspaces")
        .select("*")
        .eq("id", workspace_id)
        .single()
        .execute()
        .data
    )
    if not row:
        raise WorkspaceNotFoundError(workspace_id)

    return WorkspaceResponse(**row)


def list_workspaces_for_user(
    supabase: Client, *, user_id: str
) -> list[WorkspaceResponse]:
    member_rows = (
        supabase.table("workspace_members")
        .select("workspace_id")
        .eq("user_id", user_id)
        .execute()
        .data
    )
    if not member_rows:
        return []

    ws_ids = [r["workspace_id"] for r in member_rows]
    rows = (
        supabase.table("workspaces")
        .select("*")
        .in_("id", ws_ids)
        .execute()
        .data
    )
    return [WorkspaceResponse(**r) for r in rows]


def update_workspace(
    supabase: Client,
    *,
    user_id: str,
    workspace_id: str,
    payload: WorkspaceUpdate,
) -> WorkspaceResponse:
    row = (
        supabase.table("workspaces")
        .select("*")
        .eq("id", workspace_id)
        .single()
        .execute()
        .data
    )
    if not row:
        raise WorkspaceNotFoundError(workspace_id)
    if row["owner_id"] != user_id:
        raise WorkspacePermissionError(workspace_id)

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return WorkspaceResponse(**row)

    updated = (
        supabase.table("workspaces")
        .update(updates)
        .eq("id", workspace_id)
        .execute()
        .data[0]
    )
    return WorkspaceResponse(**updated)


def delete_workspace(
    supabase: Client, *, user_id: str, workspace_id: str
) -> None:
    row = (
        supabase.table("workspaces")
        .select("owner_id")
        .eq("id", workspace_id)
        .single()
        .execute()
        .data
    )
    if not row:
        raise WorkspaceNotFoundError(workspace_id)
    if row["owner_id"] != user_id:
        raise WorkspacePermissionError(workspace_id)

    supabase.table("workspaces").delete().eq("id", workspace_id).execute()
```

- [ ] **Step 4: Run tests, confirm pass**

```bash
cd /Users/alanwang/MyFiles/Project/tracker/backend && uv run pytest tests/test_workspaces_service.py -v
```

Expected: 8 tests PASS. If some fail due to over-mocking, adjust mocks (NOT the implementation) — the goal is to test the actual logic with realistic mocks.

- [ ] **Step 5: Commit**

```bash
cd /Users/alanwang/MyFiles/Project/tracker
git add backend/app/services/ backend/tests/test_workspaces_service.py
git commit -m "feat(api): add workspaces service layer"
```

---

### Task 5: Backend — workspaces router

**Files:**
- Create: `backend/app/routers/workspaces.py`
- Modify: `backend/app/main.py` (mount router)
- Create: `backend/tests/test_workspaces_router.py`

- [ ] **Step 1: Write router test FIRST**

`backend/tests/test_workspaces_router.py`:
```python
from unittest.mock import patch

import pytest

from app.schemas.workspace import WorkspaceResponse


def _ws(**over):
    base = dict(
        id="ws-1", name="Engineering", slug="eng",
        owner_id="user-1",
        created_at="2026-05-14T00:00:00Z",
        updated_at="2026-05-14T00:00:00Z",
    )
    base.update(over)
    return WorkspaceResponse(**base)


def test_list_workspaces_returns_empty_for_new_user(client, make_token):
    with patch("app.routers.workspaces.list_workspaces_for_user", return_value=[]):
        token = make_token(sub="new-user")
        response = client.get("/workspaces", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        assert response.json() == []


def test_list_workspaces_returns_users_workspaces(client, make_token):
    with patch("app.routers.workspaces.list_workspaces_for_user", return_value=[_ws(), _ws(id="ws-2", slug="ops")]):
        token = make_token(sub="user-1")
        response = client.get("/workspaces", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        assert len(response.json()) == 2


def test_create_workspace_201(client, make_token):
    with patch("app.routers.workspaces.create_workspace", return_value=_ws(name="My WS", slug="mine")):
        token = make_token(sub="user-1")
        response = client.post(
            "/workspaces",
            json={"name": "My WS", "slug": "mine"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 201
        body = response.json()
        assert body["name"] == "My WS"
        assert body["slug"] == "mine"


def test_create_workspace_duplicate_slug_409(client, make_token):
    from app.services.workspaces import WorkspaceSlugExistsError
    with patch(
        "app.routers.workspaces.create_workspace",
        side_effect=WorkspaceSlugExistsError("mine"),
    ):
        token = make_token(sub="user-1")
        response = client.post(
            "/workspaces",
            json={"name": "X", "slug": "mine"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 409


def test_get_workspace_403_when_not_member(client, make_token):
    from app.services.workspaces import WorkspacePermissionError
    with patch("app.routers.workspaces.get_workspace", side_effect=WorkspacePermissionError("ws-1")):
        token = make_token(sub="outsider")
        response = client.get("/workspaces/ws-1", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 403


def test_delete_workspace_204(client, make_token):
    with patch("app.routers.workspaces.delete_workspace", return_value=None):
        token = make_token(sub="user-1")
        response = client.delete("/workspaces/ws-1", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 204
```

- [ ] **Step 2: Add a `get_supabase_admin` FastAPI dependency**

Modify `backend/app/core/deps.py` — add this function at the bottom:
```python
from supabase import Client

from app.db.supabase import get_supabase_admin as _get_supabase_admin


def get_supabase_admin() -> Client:
    return _get_supabase_admin()
```

- [ ] **Step 3: Implement `routers/workspaces.py`**

`backend/app/routers/workspaces.py`:
```python
from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.core.deps import get_current_user_id, get_supabase_admin
from app.schemas.workspace import (
    WorkspaceCreate,
    WorkspaceResponse,
    WorkspaceUpdate,
)
from app.services.workspaces import (
    WorkspaceNotFoundError,
    WorkspacePermissionError,
    WorkspaceSlugExistsError,
    create_workspace,
    delete_workspace,
    get_workspace,
    list_workspaces_for_user,
    update_workspace,
)

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@router.get("", response_model=list[WorkspaceResponse])
def list_(
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    return list_workspaces_for_user(supabase, user_id=user_id)


@router.post("", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
def create(
    payload: WorkspaceCreate,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return create_workspace(supabase, user_id=user_id, payload=payload)
    except WorkspaceSlugExistsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Slug '{exc}' already in use",
        ) from exc


@router.get("/{ws_id}", response_model=WorkspaceResponse)
def get(
    ws_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return get_workspace(supabase, user_id=user_id, workspace_id=ws_id)
    except WorkspacePermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except WorkspaceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.patch("/{ws_id}", response_model=WorkspaceResponse)
def update(
    ws_id: str,
    payload: WorkspaceUpdate,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return update_workspace(
            supabase, user_id=user_id, workspace_id=ws_id, payload=payload
        )
    except WorkspacePermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except WorkspaceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.delete("/{ws_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(
    ws_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        delete_workspace(supabase, user_id=user_id, workspace_id=ws_id)
    except WorkspacePermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except WorkspaceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
```

- [ ] **Step 4: Mount router in `main.py`**

In `backend/app/main.py`, add `from app.routers import me, workspaces` and `app.include_router(workspaces.router)`.

- [ ] **Step 5: Run tests, full suite**

```bash
cd /Users/alanwang/MyFiles/Project/tracker/backend && uv run pytest -v
```

Expected: all previous tests + 6 new = 19 tests pass (or more if you added some).

- [ ] **Step 6: Commit**

```bash
cd /Users/alanwang/MyFiles/Project/tracker
git add backend/
git commit -m "feat(api): add workspaces router (CRUD endpoints)"
```

---

### Task 6: Backend — workspace members router (minimal)

**Files:**
- Create: `backend/app/services/members.py`
- Create: `backend/app/routers/members.py`
- Modify: `backend/app/main.py` (mount router)
- Create: `backend/tests/test_members_router.py`

Members service is simpler — most write operations are deferred to Plan 3+ (UI for invites). For now: list members, get current member's role.

- [ ] **Step 1: Implement `services/members.py`**

```python
from supabase import Client

from app.schemas.member import MemberResponse


class MemberError(Exception):
    pass


class NotAMemberError(MemberError):
    pass


def list_members(
    supabase: Client, *, user_id: str, workspace_id: str
) -> list[MemberResponse]:
    # Caller must be a member to list
    own_rows = (
        supabase.table("workspace_members")
        .select("role")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .execute()
        .data
    )
    if not own_rows:
        raise NotAMemberError(workspace_id)

    rows = (
        supabase.table("workspace_members")
        .select("*")
        .eq("workspace_id", workspace_id)
        .execute()
        .data
    )
    return [MemberResponse(**r) for r in rows]
```

- [ ] **Step 2: Implement `routers/members.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.core.deps import get_current_user_id, get_supabase_admin
from app.schemas.member import MemberResponse
from app.services.members import NotAMemberError, list_members

router = APIRouter(tags=["members"])


@router.get(
    "/workspaces/{ws_id}/members", response_model=list[MemberResponse]
)
def list_(
    ws_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return list_members(supabase, user_id=user_id, workspace_id=ws_id)
    except NotAMemberError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
```

- [ ] **Step 3: Mount in main.py**

Add `from app.routers import ..., members` and `app.include_router(members.router)`.

- [ ] **Step 4: Write test**

`backend/tests/test_members_router.py`:
```python
from unittest.mock import patch

from app.schemas.member import MemberResponse


def _m(**over):
    base = dict(
        user_id="user-1", workspace_id="ws-1", role="owner",
        created_at="2026-05-14T00:00:00Z",
    )
    base.update(over)
    return MemberResponse(**base)


def test_list_members_200(client, make_token):
    with patch("app.routers.members.list_members", return_value=[_m()]):
        token = make_token(sub="user-1")
        response = client.get(
            "/workspaces/ws-1/members",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        assert len(response.json()) == 1


def test_list_members_403_when_not_member(client, make_token):
    from app.services.members import NotAMemberError
    with patch("app.routers.members.list_members", side_effect=NotAMemberError("ws-1")):
        token = make_token(sub="outsider")
        response = client.get(
            "/workspaces/ws-1/members",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 403
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/alanwang/MyFiles/Project/tracker/backend && uv run pytest -v
```

- [ ] **Step 6: Commit**

```bash
cd /Users/alanwang/MyFiles/Project/tracker
git add backend/
git commit -m "feat(api): add workspace members list endpoint"
```

---

### Task 7: Backend — projects service (TDD)

**Files:**
- Create: `backend/app/services/projects.py`
- Create: `backend/tests/test_projects_service.py`

Same pattern as Task 4. Functions: `create_project`, `list_projects`, `get_project`, `update_project`, `delete_project`. Membership check on every operation (any member can CRUD projects — Plan 5+ refines).

- [ ] **Step 1: Write tests** (similar structure to Task 4's tests)

`backend/tests/test_projects_service.py`:
```python
from unittest.mock import MagicMock

import pytest

from app.schemas.project import ProjectCreate
from app.services.projects import (
    ProjectKeyExistsError,
    ProjectNotFoundError,
    ProjectPermissionError,
    create_project,
    get_project,
    list_projects,
)


def _proj_row(**over):
    base = {
        "id": "p-1", "workspace_id": "ws-1", "name": "Backend",
        "key": "BE", "next_issue_number": 1, "description": None,
        "created_at": "2026-05-14T00:00:00Z", "updated_at": "2026-05-14T00:00:00Z",
    }
    base.update(over)
    return base


@pytest.fixture
def mock_supabase():
    return MagicMock()


def test_create_project_returns_response(mock_supabase):
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"role": "member"}]
    mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [_proj_row()]
    result = create_project(
        mock_supabase, user_id="u1", workspace_id="ws-1",
        payload=ProjectCreate(name="Backend", key="BE"),
    )
    assert result.key == "BE"


def test_create_project_non_member_raises(mock_supabase):
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
    with pytest.raises(ProjectPermissionError):
        create_project(
            mock_supabase, user_id="u1", workspace_id="ws-1",
            payload=ProjectCreate(name="X", key="X"),
        )


def test_create_project_duplicate_key_raises(mock_supabase):
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"role": "member"}]
    from postgrest.exceptions import APIError
    mock_supabase.table.return_value.insert.return_value.execute.side_effect = APIError(
        {"code": "23505", "message": "duplicate", "details": "(workspace_id, key) already exists"}
    )
    with pytest.raises(ProjectKeyExistsError):
        create_project(
            mock_supabase, user_id="u1", workspace_id="ws-1",
            payload=ProjectCreate(name="X", key="BE"),
        )


def test_list_projects_non_member_raises(mock_supabase):
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
    with pytest.raises(ProjectPermissionError):
        list_projects(mock_supabase, user_id="u1", workspace_id="ws-1")


def test_get_project_non_member_raises(mock_supabase):
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
    with pytest.raises(ProjectPermissionError):
        get_project(mock_supabase, user_id="u1", project_id="p-1")
```

- [ ] **Step 2: Run, confirm fail**

- [ ] **Step 3: Implement `services/projects.py`**

```python
from postgrest.exceptions import APIError
from supabase import Client

from app.schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate


class ProjectError(Exception):
    pass


class ProjectNotFoundError(ProjectError):
    pass


class ProjectPermissionError(ProjectError):
    pass


class ProjectKeyExistsError(ProjectError):
    pass


def _is_member(supabase: Client, *, user_id: str, workspace_id: str) -> bool:
    rows = (
        supabase.table("workspace_members")
        .select("role")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .execute()
        .data
    )
    return bool(rows)


def create_project(
    supabase: Client, *, user_id: str, workspace_id: str, payload: ProjectCreate
) -> ProjectResponse:
    if not _is_member(supabase, user_id=user_id, workspace_id=workspace_id):
        raise ProjectPermissionError(workspace_id)

    try:
        result = (
            supabase.table("projects")
            .insert(
                {
                    "workspace_id": workspace_id,
                    "name": payload.name,
                    "key": payload.key,
                    "description": payload.description,
                }
            )
            .execute()
        )
    except APIError as exc:
        if "duplicate" in str(exc).lower() or "23505" in str(exc):
            raise ProjectKeyExistsError(payload.key) from exc
        raise

    return ProjectResponse(**result.data[0])


def list_projects(
    supabase: Client, *, user_id: str, workspace_id: str
) -> list[ProjectResponse]:
    if not _is_member(supabase, user_id=user_id, workspace_id=workspace_id):
        raise ProjectPermissionError(workspace_id)

    rows = (
        supabase.table("projects")
        .select("*")
        .eq("workspace_id", workspace_id)
        .order("created_at")
        .execute()
        .data
    )
    return [ProjectResponse(**r) for r in rows]


def get_project(
    supabase: Client, *, user_id: str, project_id: str
) -> ProjectResponse:
    row = (
        supabase.table("projects")
        .select("*")
        .eq("id", project_id)
        .single()
        .execute()
        .data
    )
    if not row:
        raise ProjectNotFoundError(project_id)
    if not _is_member(supabase, user_id=user_id, workspace_id=row["workspace_id"]):
        raise ProjectPermissionError(project_id)
    return ProjectResponse(**row)


def update_project(
    supabase: Client, *, user_id: str, project_id: str, payload: ProjectUpdate
) -> ProjectResponse:
    # Fetch first to discover workspace_id and check membership
    current = get_project(supabase, user_id=user_id, project_id=project_id)

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return current

    updated = (
        supabase.table("projects")
        .update(updates)
        .eq("id", project_id)
        .execute()
        .data[0]
    )
    return ProjectResponse(**updated)


def delete_project(
    supabase: Client, *, user_id: str, project_id: str
) -> None:
    # Verify membership via get_project's checks
    get_project(supabase, user_id=user_id, project_id=project_id)
    supabase.table("projects").delete().eq("id", project_id).execute()
```

- [ ] **Step 4: Tests pass**

- [ ] **Step 5: Commit**

```bash
cd /Users/alanwang/MyFiles/Project/tracker
git add backend/app/services/projects.py backend/tests/test_projects_service.py
git commit -m "feat(api): add projects service layer"
```

---

### Task 8: Backend — projects router

**Files:**
- Create: `backend/app/routers/projects.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_projects_router.py`

Same pattern as Task 5.

- [ ] **Step 1: Write tests**

`backend/tests/test_projects_router.py`:
```python
from unittest.mock import patch

from app.schemas.project import ProjectResponse


def _p(**over):
    base = dict(
        id="p-1", workspace_id="ws-1", name="Backend", key="BE",
        next_issue_number=1, description=None,
        created_at="2026-05-14T00:00:00Z", updated_at="2026-05-14T00:00:00Z",
    )
    base.update(over)
    return ProjectResponse(**base)


def test_list_projects_200(client, make_token):
    with patch("app.routers.projects.list_projects", return_value=[_p()]):
        token = make_token(sub="user-1")
        response = client.get(
            "/workspaces/ws-1/projects",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        assert len(response.json()) == 1


def test_list_projects_403_when_not_member(client, make_token):
    from app.services.projects import ProjectPermissionError
    with patch(
        "app.routers.projects.list_projects",
        side_effect=ProjectPermissionError("ws-1"),
    ):
        token = make_token(sub="x")
        response = client.get(
            "/workspaces/ws-1/projects",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 403


def test_create_project_201(client, make_token):
    with patch("app.routers.projects.create_project", return_value=_p()):
        token = make_token(sub="user-1")
        response = client.post(
            "/workspaces/ws-1/projects",
            json={"name": "Backend", "key": "BE"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 201


def test_create_project_duplicate_key_409(client, make_token):
    from app.services.projects import ProjectKeyExistsError
    with patch(
        "app.routers.projects.create_project",
        side_effect=ProjectKeyExistsError("BE"),
    ):
        token = make_token(sub="user-1")
        response = client.post(
            "/workspaces/ws-1/projects",
            json={"name": "X", "key": "BE"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 409
```

- [ ] **Step 2: Implement router**

`backend/app/routers/projects.py`:
```python
from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.core.deps import get_current_user_id, get_supabase_admin
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate
from app.services.projects import (
    ProjectKeyExistsError,
    ProjectNotFoundError,
    ProjectPermissionError,
    create_project,
    delete_project,
    get_project,
    list_projects,
    update_project,
)

router = APIRouter(tags=["projects"])


@router.get(
    "/workspaces/{ws_id}/projects", response_model=list[ProjectResponse]
)
def list_(
    ws_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return list_projects(supabase, user_id=user_id, workspace_id=ws_id)
    except ProjectPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc


@router.post(
    "/workspaces/{ws_id}/projects",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
def create(
    ws_id: str,
    payload: ProjectCreate,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return create_project(
            supabase, user_id=user_id, workspace_id=ws_id, payload=payload
        )
    except ProjectPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except ProjectKeyExistsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Project key '{exc}' already in use in this workspace",
        ) from exc


@router.get("/projects/{p_id}", response_model=ProjectResponse)
def get(
    p_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return get_project(supabase, user_id=user_id, project_id=p_id)
    except ProjectPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.patch("/projects/{p_id}", response_model=ProjectResponse)
def update(
    p_id: str,
    payload: ProjectUpdate,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return update_project(supabase, user_id=user_id, project_id=p_id, payload=payload)
    except ProjectPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.delete("/projects/{p_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(
    p_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        delete_project(supabase, user_id=user_id, project_id=p_id)
    except ProjectPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
```

- [ ] **Step 3: Mount in main.py**

- [ ] **Step 4: Tests pass**

- [ ] **Step 5: Commit**

```bash
cd /Users/alanwang/MyFiles/Project/tracker
git add backend/
git commit -m "feat(api): add projects router (CRUD endpoints)"
```

---

### Task 9: Backend — update /me to return real workspaces

**Files:**
- Modify: `backend/app/routers/me.py`
- Modify: `backend/app/schemas/user.py` (extend WorkspaceSummary)
- Modify: `backend/tests/test_me.py`

- [ ] **Step 1: Extend `schemas/user.py`**

WorkspaceSummary should match a slim subset of WorkspaceResponse:

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

(This is already the structure — no change needed.)

- [ ] **Step 2: Update `routers/me.py`** to call the workspaces service

```python
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client

from app.core.config import Settings, get_settings
from app.core.deps import get_current_user_id, get_supabase_admin
from app.core.security import (
    InvalidTokenError,
    verify_and_decode_supabase_jwt,
)
from app.schemas.user import MeResponse, WorkspaceSummary
from app.services.workspaces import list_workspaces_for_user

router = APIRouter()

bearer_scheme = HTTPBearer(auto_error=False)


@router.get("/me", response_model=MeResponse)
def get_me(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    user_id: str = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
    supabase: Client = Depends(get_supabase_admin),
) -> MeResponse:
    email: str | None = None
    if creds is not None:
        try:
            payload = verify_and_decode_supabase_jwt(
                creds.credentials, settings.supabase_jwt_secret
            )
            email = payload.get("email")
        except InvalidTokenError:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    workspaces = list_workspaces_for_user(supabase, user_id=user_id)
    workspace_summaries = [
        WorkspaceSummary(id=w.id, slug=w.slug, name=w.name) for w in workspaces
    ]

    return MeResponse(id=user_id, email=email, workspaces=workspace_summaries)
```

- [ ] **Step 3: Update test_me.py**

The existing test_me.py expected `workspaces == []`. Now that /me actually calls the service, we need to either mock it or accept any list. Easiest: mock.

```python
from unittest.mock import patch


def test_me_requires_auth(client):
    response = client.get("/me")
    assert response.status_code == 401


def test_me_returns_user_info_with_empty_workspaces(client, make_token):
    with patch("app.routers.me.list_workspaces_for_user", return_value=[]):
        token = make_token(sub="user-xyz", email="user@example.com")
        response = client.get("/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        body = response.json()
        assert body["id"] == "user-xyz"
        assert body["email"] == "user@example.com"
        assert body["workspaces"] == []


def test_me_returns_workspaces_when_user_has_some(client, make_token):
    from app.schemas.workspace import WorkspaceResponse

    fake_ws = WorkspaceResponse(
        id="ws-1", name="Engineering", slug="eng",
        owner_id="user-xyz",
        created_at="2026-05-14T00:00:00Z",
        updated_at="2026-05-14T00:00:00Z",
    )
    with patch("app.routers.me.list_workspaces_for_user", return_value=[fake_ws]):
        token = make_token(sub="user-xyz", email="u@e.com")
        response = client.get("/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        body = response.json()
        assert len(body["workspaces"]) == 1
        assert body["workspaces"][0]["slug"] == "eng"
```

- [ ] **Step 4: Run full test suite**

```bash
cd /Users/alanwang/MyFiles/Project/tracker/backend && uv run pytest -v
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/alanwang/MyFiles/Project/tracker
git add backend/
git commit -m "feat(api): /me now returns real workspaces from DB"
```

---

### Task 10: Frontend — workspaces API hooks

**Files:**
- Create: `frontend/src/features/workspaces/api.ts`
- Create: `frontend/src/features/projects/api.ts`

- [ ] **Step 1: Create `features/workspaces/api.ts`**

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/api/client";

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
};

export type WorkspaceCreate = { name: string; slug: string };
export type WorkspaceUpdate = { name?: string };

export function useWorkspaces() {
  return useQuery<Workspace[]>({
    queryKey: ["workspaces"],
    queryFn: async () => {
      const { data } = await apiClient.get<Workspace[]>("/workspaces");
      return data;
    },
  });
}

export function useWorkspace(wsId: string) {
  return useQuery<Workspace>({
    queryKey: ["workspaces", wsId],
    queryFn: async () => {
      const { data } = await apiClient.get<Workspace>(`/workspaces/${wsId}`);
      return data;
    },
    enabled: !!wsId,
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: WorkspaceCreate) => {
      const { data } = await apiClient.post<Workspace>("/workspaces", payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}
```

- [ ] **Step 2: Create `features/projects/api.ts`**

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/api/client";

export type Project = {
  id: string;
  workspace_id: string;
  name: string;
  key: string;
  next_issue_number: number;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectCreate = {
  name: string;
  key: string;
  description?: string;
};

export function useProjects(wsId: string) {
  return useQuery<Project[]>({
    queryKey: ["workspaces", wsId, "projects"],
    queryFn: async () => {
      const { data } = await apiClient.get<Project[]>(
        `/workspaces/${wsId}/projects`,
      );
      return data;
    },
    enabled: !!wsId,
  });
}

export function useCreateProject(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ProjectCreate) => {
      const { data } = await apiClient.post<Project>(
        `/workspaces/${wsId}/projects`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces", wsId, "projects"] });
    },
  });
}
```

- [ ] **Step 3: tsc passes**

```bash
cd /Users/alanwang/MyFiles/Project/tracker/frontend && pnpm tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd /Users/alanwang/MyFiles/Project/tracker
git add frontend/src/features/
git commit -m "feat(web): add workspaces and projects API hooks"
```

---

### Task 11: Frontend — Onboarding page

**Files:**
- Create: `frontend/src/pages/Onboarding.tsx`
- Modify: `frontend/src/App.tsx` (add /onboarding route)

- [ ] **Step 1: Create Onboarding page**

`frontend/src/pages/Onboarding.tsx`:
```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateWorkspace } from "@/features/workspaces/api";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export default function Onboarding() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const createMutation = useCreateWorkspace();

  function onNameChange(v: string) {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const ws = await createMutation.mutateAsync({ name, slug });
      toast.success(`Created workspace ${ws.name}`);
      navigate(`/w/${ws.slug}`);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to create workspace";
      toast.error(detail);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome to tracker</CardTitle>
          <CardDescription>
            Let's create your first workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">Workspace name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                required
                minLength={1}
                maxLength={100}
                placeholder="Engineering"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="slug">URL slug</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugTouched(true);
                }}
                required
                minLength={2}
                maxLength={50}
                pattern="[a-z0-9-]+"
                placeholder="eng"
              />
              <p className="text-xs text-muted-foreground">
                Used in your workspace URL: /w/{slug || "your-slug"}
              </p>
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Creating…" : "Create workspace"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Add /onboarding route in App.tsx**

```tsx
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import AuthCallback from "@/pages/AuthCallback";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Onboarding from "@/pages/Onboarding";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <Onboarding />
            </ProtectedRoute>
          }
        />
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

- [ ] **Step 3: tsc + commit**

```bash
cd /Users/alanwang/MyFiles/Project/tracker/frontend && pnpm tsc --noEmit
cd /Users/alanwang/MyFiles/Project/tracker
git add frontend/
git commit -m "feat(web): add onboarding page for first workspace"
```

---

### Task 12: Frontend — Home page routes to picker or onboarding

**Files:**
- Modify: `frontend/src/pages/Home.tsx`

After Task 11, `/` renders the old "Welcome to tracker" home. We want `/`:
- If user has 0 workspaces → redirect `/onboarding`
- If user has ≥ 1 workspace → redirect to `/w/<last_or_first_slug>`

- [ ] **Step 1: Replace Home.tsx**

```tsx
import { useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { useCurrentUser } from "@/hooks/useCurrentUser";

const LAST_WORKSPACE_KEY = "tracker.lastWorkspaceSlug";

export default function Home() {
  const { data: me, isLoading } = useCurrentUser();
  const navigate = useNavigate();

  useEffect(() => {
    if (!me) return;
    if (me.workspaces.length === 0) {
      navigate("/onboarding", { replace: true });
      return;
    }
    const stored = localStorage.getItem(LAST_WORKSPACE_KEY);
    const target = me.workspaces.find((w) => w.slug === stored) ?? me.workspaces[0];
    navigate(`/w/${target.slug}`, { replace: true });
  }, [me, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading…</p>
      </div>
    );
  }

  // While effect is firing, return nothing
  return null;
}
```

- [ ] **Step 2: tsc + commit**

```bash
cd /Users/alanwang/MyFiles/Project/tracker/frontend && pnpm tsc --noEmit
cd /Users/alanwang/MyFiles/Project/tracker
git add frontend/src/pages/Home.tsx
git commit -m "feat(web): / redirects to onboarding or last workspace"
```

---

### Task 13: Frontend — WorkspaceLayout (sidebar)

**Files:**
- Create: `frontend/src/components/WorkspaceLayout.tsx`

The Layout component renders a sidebar + `<Outlet />` for nested routes.

- [ ] **Step 1: Implement WorkspaceLayout**

`frontend/src/components/WorkspaceLayout.tsx`:
```tsx
import { Outlet, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useWorkspaces } from "@/features/workspaces/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { supabase } from "@/lib/supabase";

const LAST_WORKSPACE_KEY = "tracker.lastWorkspaceSlug";

export function WorkspaceLayout() {
  const { wsSlug } = useParams();
  const navigate = useNavigate();
  const { data: workspaces = [] } = useWorkspaces();
  const { data: me } = useCurrentUser();

  const currentWs = workspaces.find((w) => w.slug === wsSlug);

  useEffect(() => {
    if (wsSlug) localStorage.setItem(LAST_WORKSPACE_KEY, wsSlug);
  }, [wsSlug]);

  useEffect(() => {
    if (workspaces.length > 0 && !currentWs) {
      // The slug in the URL doesn't match any workspace; bounce to home.
      navigate("/", { replace: true });
    }
  }, [workspaces, currentWs, navigate]);

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) toast.error(error.message);
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="w-60 border-r border-slate-200 bg-white p-4 flex flex-col">
        <div className="flex flex-col">
          <span className="text-xs uppercase text-muted-foreground">
            Workspace
          </span>
          <span className="font-medium text-slate-900">
            {currentWs?.name ?? "…"}
          </span>
        </div>
        <hr className="my-4" />
        <nav className="flex-1 space-y-1 text-sm">
          <button
            type="button"
            className="block w-full text-left rounded px-2 py-1 hover:bg-slate-100"
            onClick={() => navigate(`/w/${wsSlug}`)}
          >
            Projects
          </button>
        </nav>
        <hr className="my-4" />
        <div className="text-xs text-muted-foreground space-y-1">
          <div>{me?.email}</div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={signOut}
          >
            Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: tsc + commit**

```bash
cd /Users/alanwang/MyFiles/Project/tracker/frontend && pnpm tsc --noEmit
cd /Users/alanwang/MyFiles/Project/tracker
git add frontend/src/components/WorkspaceLayout.tsx
git commit -m "feat(web): add WorkspaceLayout with sidebar"
```

---

### Task 14: Frontend — Workspace home page (project list + create)

**Files:**
- Create: `frontend/src/pages/WorkspaceHome.tsx`
- Modify: `frontend/src/App.tsx` (mount WorkspaceLayout)

- [ ] **Step 1: Create WorkspaceHome**

`frontend/src/pages/WorkspaceHome.tsx`:
```tsx
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateProject, useProjects } from "@/features/projects/api";
import { useWorkspaces } from "@/features/workspaces/api";

export default function WorkspaceHome() {
  const { wsSlug } = useParams();
  const navigate = useNavigate();
  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);

  const { data: projects = [], isLoading } = useProjects(currentWs?.id ?? "");
  const createMutation = useCreateProject(currentWs?.id ?? "");

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");

  async function onCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!currentWs) return;
    try {
      const p = await createMutation.mutateAsync({ name, key: key.toUpperCase() });
      toast.success(`Created project ${p.name}`);
      setShowForm(false);
      setName("");
      setKey("");
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to create project";
      toast.error(detail);
    }
  }

  if (!currentWs) return null;  // WorkspaceLayout will redirect

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Projects</h1>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "New project"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>New project</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onCreateProject} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="proj-name">Name</Label>
                <Input
                  id="proj-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Backend"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="proj-key">Key</Label>
                <Input
                  id="proj-key"
                  value={key}
                  onChange={(e) => setKey(e.target.value.toUpperCase())}
                  required
                  minLength={2}
                  maxLength={10}
                  pattern="[A-Z][A-Z0-9]*"
                  placeholder="BE"
                />
                <p className="text-xs text-muted-foreground">
                  Issues in this project will look like {key || "BE"}-1, {key || "BE"}-2, …
                </p>
              </div>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : "Create"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading && <p>Loading projects…</p>}
      {!isLoading && projects.length === 0 && (
        <p className="text-muted-foreground">
          No projects yet. Click "New project" to create your first.
        </p>
      )}
      <div className="grid gap-2">
        {projects.map((p) => (
          <button
            key={p.id}
            type="button"
            className="text-left p-4 rounded border border-slate-200 bg-white hover:bg-slate-50"
            onClick={() => navigate(`/w/${wsSlug}/p/${p.key}`)}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                {p.key}
              </span>
              <span className="font-medium">{p.name}</span>
            </div>
            {p.description && (
              <p className="text-sm text-muted-foreground mt-1">
                {p.description}
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update App.tsx — mount /w/:wsSlug under WorkspaceLayout**

```tsx
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { WorkspaceLayout } from "@/components/WorkspaceLayout";
import AuthCallback from "@/pages/AuthCallback";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Onboarding from "@/pages/Onboarding";
import WorkspaceHome from "@/pages/WorkspaceHome";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <Onboarding />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />
        <Route
          path="/w/:wsSlug"
          element={
            <ProtectedRoute>
              <WorkspaceLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<WorkspaceHome />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 3: tsc**

```bash
cd /Users/alanwang/MyFiles/Project/tracker/frontend && pnpm tsc --noEmit
```

- [ ] **Step 4: Manual smoke test**

```bash
cd /Users/alanwang/MyFiles/Project/tracker && make dev
```

In browser:
1. Sign in (or sign up new user)
2. If new user → /onboarding shows form
3. Fill in name "Engineering" / slug "eng" / submit → redirects to /w/eng
4. Sidebar shows "Engineering" + Projects link + sign out
5. Click "New project" → form appears
6. Name "Backend", key "BE" → submit → project appears in list
7. Reload page → workspace still shown (localStorage), projects still listed

- [ ] **Step 5: Commit**

```bash
cd /Users/alanwang/MyFiles/Project/tracker
git add frontend/
git commit -m "feat(web): workspace home with project list + create"
```

---

### Task 15: Frontend — E2E test for workspace creation

**Files:**
- Create: `frontend/tests/workspace.spec.ts`

- [ ] **Step 1: Write E2E**

`frontend/tests/workspace.spec.ts`:
```typescript
import { expect, test } from "@playwright/test";

const TS = Date.now();
const TEST_EMAIL = `ws+${TS}@example.com`;
const TEST_PASSWORD = "test-password-123";
const WS_NAME = `Test WS ${TS}`;
const WS_SLUG = `test-ws-${TS}`;
const PROJ_NAME = "Backend";
const PROJ_KEY = "BE";

test.describe.serial("workspace + project flow", () => {
  test("new user is routed to onboarding", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);

    await page.getByRole("button", { name: /no account/i }).click();
    await page.getByLabel(/email/i).fill(TEST_EMAIL);
    await page.getByLabel(/password/i).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign up/i }).click();

    // Should redirect to /onboarding (no workspaces)
    await page.waitForURL("**/onboarding", { timeout: 15_000 });
    await expect(page.getByText(/welcome to tracker/i)).toBeVisible();
  });

  test("creating workspace redirects to /w/<slug>", async ({ page }) => {
    await page.goto("/");
    // Should land on /onboarding (session from previous test)
    await page.waitForURL("**/onboarding");

    await page.getByLabel(/workspace name/i).fill(WS_NAME);
    // Slug auto-fills from name; override to deterministic test slug
    await page.getByLabel(/url slug/i).fill(WS_SLUG);
    await page.getByRole("button", { name: /create workspace/i }).click();

    await page.waitForURL(`**/w/${WS_SLUG}`, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /projects/i })).toBeVisible();
  });

  test("can create a project in the workspace", async ({ page }) => {
    await page.goto(`/w/${WS_SLUG}`);
    await page.getByRole("button", { name: /new project/i }).click();

    await page.getByLabel(/^name$/i).fill(PROJ_NAME);
    await page.getByLabel(/^key$/i).fill(PROJ_KEY);
    await page.getByRole("button", { name: /^create$/i }).click();

    await expect(page.getByText(PROJ_NAME)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(PROJ_KEY)).toBeVisible();
  });
});
```

- [ ] **Step 2: Run E2E**

Make sure supabase + api + web are up:
```bash
cd /Users/alanwang/MyFiles/Project/tracker && supabase status
```

If api was started on 8001 by playwright config in Plan 1 Task 15, keep that config. Run:

```bash
cd /Users/alanwang/MyFiles/Project/tracker/frontend && pnpm exec playwright test
```

Expected: both auth.spec.ts (2 tests) and workspace.spec.ts (3 tests) pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/alanwang/MyFiles/Project/tracker
git add frontend/tests/workspace.spec.ts
git commit -m "test(web): add E2E for workspace + project creation"
```

---

## Done When

- [ ] All 15 tasks complete and committed.
- [ ] `make test` passes (api pytest + tsc).
- [ ] `make test-e2e` passes (auth + workspace specs).
- [ ] Browser flow works end-to-end:
  - Sign up new user → onboarding → create workspace "Engineering" → /w/eng → New project "Backend" / key "BE" → project visible
  - Reload → still on /w/eng with project visible
- [ ] `supabase db reset` cleanly applies both Plan 1 and Plan 2 migrations.
- [ ] /me endpoint returns the user's workspaces.

## What's Next

Plan 3: **Issues CRUD + List View**
- `issues` table with all fields from the spec (status, priority, assignee, etc.) + RLS
- POST /issues, GET /projects/:p/issues, GET /issues/:id, PATCH, DELETE
- Frontend: issue list view with filter / sort; issue detail page (basic, no comments yet)
- Identifier allocation (BE-1, BE-2, …) via atomic counter on `projects.next_issue_number`

After Plan 3, you'll be able to create issues in a project, see them listed, and open issue detail pages.
