# Issues CRUD + List View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A workspace member can create issues inside a project (auto-assigned identifiers like `BE-1`), see them in a sortable/filterable list, open one for detail, and edit its core fields. Sub-issues, sprints, comments, labels, kanban, and realtime are explicitly out of scope for this plan.

**Architecture:** Backend exposes `issues` resource via FastAPI under `/projects/{p_id}/issues` and `/issues/{i_id}`. Identifier allocation is atomic via a Supabase RPC function (`create_issue_with_identifier`) that locks the project row, increments `next_issue_number`, and inserts the issue in a single transaction. Service layer still validates workspace membership before calling the RPC (defense-in-depth alongside RLS). Frontend gains `/w/:wsSlug/p/:pKey/list` (issue list with status filter + create form) and `/w/:wsSlug/p/:pKey/issues/:identifier` (detail page with inline-editable fields).

**Tech Stack:** Same as Plan 1/2 — FastAPI + Supabase (Postgres) + Vite + React + shadcn/ui.

**Conventions reused from Plan 2:**
- `routers/issues.py` (thin) → `services/issues.py` (business) → `db/supabase.py` (admin client). Service checks `_is_member` before any operation.
- RLS pattern: defense-in-depth with `WITH CHECK` on UPDATE.
- Service tests use `MagicMock` with `table_router` for multi-table chains.
- Router tests use `patch("app.routers.issues.<func>")` to mock service layer.
- Frontend pattern: `features/<resource>/api.ts` (React Query hooks), pages under `pages/`, routes wired in `App.tsx`.

---

## File Structure

This plan creates / modifies (paths relative to `/Users/alanwang/MyFiles/Project/tracker/`):

```
backend/
  app/
    schemas/
      issue.py                       # NEW
    services/
      issues.py                      # NEW
    routers/
      issues.py                      # NEW
    main.py                          # MODIFIED: mount issues router
  tests/
    test_issues_service.py           # NEW
    test_issues_router.py            # NEW

supabase/
  migrations/
    20260516000000_issues.sql        # NEW (table + enums + RLS + RPC)

frontend/
  src/
    features/
      issues/
        api.ts                       # NEW (React Query hooks)
    pages/
      IssueList.tsx                  # NEW
      IssueDetail.tsx                # NEW
      WorkspaceHome.tsx              # MODIFIED: project card → /list
    App.tsx                          # MODIFIED: add issues routes
  tests/
    workspace.spec.ts                # MODIFIED: extend with issue E2E
```

**File responsibilities:**
- `services/issues.py`: business logic. Membership check → call `supabase.rpc("create_issue_with_identifier", ...)` for create; direct table queries for list/get/update/delete. Raises domain errors.
- `routers/issues.py`: HTTP layer. Maps domain errors to 403/404. POST under project, GET/PATCH/DELETE on issue.
- `features/issues/api.ts`: hooks `useIssues`, `useIssue`, `useCreateIssue`, `useUpdateIssue`, `useDeleteIssue`.
- `IssueList`: table with identifier/title/status/priority/created_at columns, status filter dropdown, inline create form.
- `IssueDetail`: title/status/priority/description/due_date editable in place; delete button with confirm.

---

## Tasks

### Task 1: Database migration — issues table + enums + RPC

**Files:**
- Create: `supabase/migrations/20260516000000_issues.sql`

The migration creates two enums, the `issues` table with all spec fields (including `sprint_id` and `parent_id` columns even though sprints/sub-issues aren't implemented yet), indexes, the `updated_at` trigger, RLS policies, and the `create_issue_with_identifier` RPC function.

- [ ] **Step 1: Write the migration**

`supabase/migrations/20260516000000_issues.sql`:
```sql
-- Issues + identifier-allocating RPC.
-- RLS is defense-in-depth; the FastAPI service layer also enforces membership.

-- ─── Enums ───
create type issue_status as enum
  ('backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled');

create type issue_priority as enum
  ('no_priority', 'urgent', 'high', 'medium', 'low');

-- ─── issues ───
-- Note: sprint_id column exists but has NO FK constraint in Plan 3 because
-- the `sprints` table is introduced in Plan 4. Plan 4 will add the FK via
-- ALTER TABLE. parent_id (sub-issues) similarly always null in Plan 3.
create table issues (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  sprint_id uuid,                                                       -- FK deferred to Plan 4
  parent_id uuid references issues(id) on delete set null,
  identifier text not null,
  title text not null,
  description text not null default '',
  status issue_status not null default 'backlog',
  priority issue_priority not null default 'no_priority',
  assignee_id uuid references auth.users(id) on delete set null,
  reporter_id uuid references auth.users(id) on delete set null,
  due_date date,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, identifier)
);

create index issues_project_id_status_idx on issues (project_id, status);
create index issues_assignee_id_idx on issues (assignee_id) where assignee_id is not null;

create trigger issues_set_updated_at
  before update on issues
  for each row execute function set_updated_at();

-- ─── RLS ───
alter table issues enable row level security;

create policy "members can read workspace issues"
  on issues for select
  using (is_workspace_member(workspace_id));

create policy "members can insert workspace issues"
  on issues for insert
  with check (is_workspace_member(workspace_id));

create policy "members can update workspace issues"
  on issues for update
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

create policy "members can delete workspace issues"
  on issues for delete
  using (is_workspace_member(workspace_id));

-- ─── Atomic identifier-allocating RPC ───
-- Locks the project row, increments next_issue_number, computes identifier,
-- inserts the issue. Returns the inserted row.
-- SECURITY DEFINER: bypasses RLS for the project read/update + issue insert.
-- Caller (FastAPI service layer) must validate workspace membership first.
create or replace function create_issue_with_identifier(
  p_workspace_id uuid,
  p_project_id uuid,
  p_title text,
  p_description text,
  p_priority issue_priority,
  p_status issue_status,
  p_assignee_id uuid,
  p_due_date date,
  p_reporter_id uuid
) returns issues
language plpgsql
security definer
set search_path = public
as $$
declare
  v_issue_number int;
  v_project_key text;
  v_identifier text;
  v_issue issues;
begin
  -- Atomically read+increment counter on the locked project row.
  -- RETURNING `next_issue_number - 1` gives the value BEFORE increment,
  -- which is the number we use for this new issue.
  update projects
  set next_issue_number = next_issue_number + 1
  where id = p_project_id
  returning next_issue_number - 1, key
  into v_issue_number, v_project_key;

  if v_issue_number is null then
    raise exception 'project not found: %', p_project_id
      using errcode = 'P0002';
  end if;

  v_identifier := v_project_key || '-' || v_issue_number;

  insert into issues (
    workspace_id, project_id, identifier, title, description,
    status, priority, assignee_id, reporter_id, due_date
  ) values (
    p_workspace_id, p_project_id, v_identifier, p_title, coalesce(p_description, ''),
    coalesce(p_status, 'backlog'::issue_status),
    coalesce(p_priority, 'no_priority'::issue_priority),
    p_assignee_id, p_reporter_id, p_due_date
  )
  returning * into v_issue;

  return v_issue;
end;
$$;
```

- [ ] **Step 2: Apply migration**

```bash
cd /Users/alanwang/MyFiles/Project/tracker && supabase db reset
```

Expected: all migrations apply cleanly. Output ends with "Database reset successfully."

- [ ] **Step 3: Smoke test schema via psql**

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "
  select table_name from information_schema.tables
  where table_schema='public' and table_name='issues';
"
```
Expected: 1 row (`issues`).

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "
  select policyname from pg_policies
  where schemaname='public' and tablename='issues';
"
```
Expected: 4 policies.

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "
  select proname, prosecdef from pg_proc
  where proname='create_issue_with_identifier';
"
```
Expected: 1 row, `prosecdef = t` (security definer).

- [ ] **Step 4: Commit**

```bash
cd /Users/alanwang/MyFiles/Project/tracker
git add supabase/migrations/
git commit -m "feat(db): add issues table + enums + identifier-allocating RPC"
```

---

### Task 2: Backend — issue Pydantic schemas

**Files:**
- Create: `backend/app/schemas/issue.py`

No tests for this task — schemas validated implicitly by service/router tests.

- [ ] **Step 1: Create `schemas/issue.py`**

`backend/app/schemas/issue.py`:
```python
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


# Keep these in sync with the issue_status / issue_priority enums in
# migrations/20260516000000_issues.sql.
IssueStatus = Literal[
    "backlog", "todo", "in_progress", "in_review", "done", "cancelled"
]
IssuePriority = Literal[
    "no_priority", "urgent", "high", "medium", "low"
]


class IssueCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=10000)
    status: IssueStatus = "backlog"
    priority: IssuePriority = "no_priority"
    assignee_id: str | None = None
    due_date: date | None = None


class IssueUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=10000)
    status: IssueStatus | None = None
    priority: IssuePriority | None = None
    assignee_id: str | None = None
    due_date: date | None = None


class IssueResponse(BaseModel):
    id: str
    workspace_id: str
    project_id: str
    sprint_id: str | None
    parent_id: str | None
    identifier: str
    title: str
    description: str
    status: IssueStatus
    priority: IssuePriority
    assignee_id: str | None
    reporter_id: str | None
    due_date: date | None
    position: float
    created_at: datetime
    updated_at: datetime
```

- [ ] **Step 2: Verify imports cleanly**

```bash
cd /Users/alanwang/MyFiles/Project/tracker/backend && uv run python -c "from app.schemas.issue import IssueCreate, IssueUpdate, IssueResponse, IssueStatus, IssuePriority; print('ok')"
```
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
cd /Users/alanwang/MyFiles/Project/tracker
git add backend/app/schemas/issue.py
git commit -m "feat(api): add issue Pydantic schemas"
```

---

### Task 3: Backend — issues service (TDD)

**Files:**
- Create: `backend/app/services/issues.py`
- Create: `backend/tests/test_issues_service.py`

Service functions: `create_issue` (via RPC), `list_issues`, `get_issue`, `update_issue`, `delete_issue`. All require workspace membership; service raises domain errors (`IssueNotFoundError`, `IssuePermissionError`, `ProjectNotFoundError`).

- [ ] **Step 1: Write failing tests**

`backend/tests/test_issues_service.py`:
```python
from datetime import datetime
from unittest.mock import MagicMock

import pytest

from app.schemas.issue import IssueCreate, IssueUpdate
from app.services.issues import (
    IssueNotFoundError,
    IssuePermissionError,
    ProjectNotFoundError,
    create_issue,
    delete_issue,
    get_issue,
    list_issues,
    update_issue,
)


def _issue_row(**over):
    base = {
        "id": "i-1",
        "workspace_id": "ws-1",
        "project_id": "p-1",
        "sprint_id": None,
        "parent_id": None,
        "identifier": "BE-1",
        "title": "Test issue",
        "description": "",
        "status": "backlog",
        "priority": "no_priority",
        "assignee_id": None,
        "reporter_id": "u-1",
        "due_date": None,
        "position": 0.0,
        "created_at": "2026-05-14T00:00:00Z",
        "updated_at": "2026-05-14T00:00:00Z",
    }
    base.update(over)
    return base


def _project_row(**over):
    base = {
        "id": "p-1",
        "workspace_id": "ws-1",
        "name": "Backend",
        "key": "BE",
        "next_issue_number": 1,
        "description": None,
        "created_at": "2026-05-14T00:00:00Z",
        "updated_at": "2026-05-14T00:00:00Z",
    }
    base.update(over)
    return base


@pytest.fixture
def mock_supabase():
    return MagicMock()


def test_create_issue_calls_rpc_with_membership_check(mock_supabase):
    """Service: verify membership → fetch project → call RPC → return."""
    # Membership check chain (workspace_members)
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"role": "member"}
    ]
    # Project fetch chain
    project_chain = MagicMock()
    project_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
        _project_row()
    )

    def table_router(name):
        if name == "workspace_members":
            return members_chain
        if name == "projects":
            return project_chain
        raise AssertionError(f"unexpected table: {name}")

    mock_supabase.table.side_effect = table_router
    mock_supabase.rpc.return_value.execute.return_value.data = _issue_row()

    result = create_issue(
        mock_supabase,
        user_id="u-1",
        project_id="p-1",
        payload=IssueCreate(title="Test issue"),
    )

    assert result.identifier == "BE-1"
    mock_supabase.rpc.assert_called_once()
    args, kwargs = mock_supabase.rpc.call_args
    assert args[0] == "create_issue_with_identifier"
    # Verify reporter_id is the caller and workspace_id is from project
    rpc_args = args[1]
    assert rpc_args["p_reporter_id"] == "u-1"
    assert rpc_args["p_workspace_id"] == "ws-1"
    assert rpc_args["p_project_id"] == "p-1"
    assert rpc_args["p_title"] == "Test issue"


def test_create_issue_non_member_raises(mock_supabase):
    project_chain = MagicMock()
    project_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
        _project_row()
    )
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []

    def table_router(name):
        if name == "projects":
            return project_chain
        if name == "workspace_members":
            return members_chain
        raise AssertionError(f"unexpected table: {name}")

    mock_supabase.table.side_effect = table_router

    with pytest.raises(IssuePermissionError):
        create_issue(
            mock_supabase,
            user_id="u-1",
            project_id="p-1",
            payload=IssueCreate(title="Test"),
        )
    mock_supabase.rpc.assert_not_called()


def test_create_issue_project_not_found(mock_supabase):
    project_chain = MagicMock()
    project_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = None

    def table_router(name):
        if name == "projects":
            return project_chain
        raise AssertionError(f"unexpected table: {name}")

    mock_supabase.table.side_effect = table_router

    with pytest.raises(ProjectNotFoundError):
        create_issue(
            mock_supabase,
            user_id="u-1",
            project_id="missing",
            payload=IssueCreate(title="Test"),
        )


def test_list_issues_filters_by_status(mock_supabase):
    project_chain = MagicMock()
    project_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
        _project_row()
    )
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"role": "member"}
    ]
    issues_chain = MagicMock()
    issues_chain.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = [
        _issue_row(identifier="BE-1", status="todo"),
        _issue_row(id="i-2", identifier="BE-2", status="todo"),
    ]

    def table_router(name):
        if name == "projects":
            return project_chain
        if name == "workspace_members":
            return members_chain
        if name == "issues":
            return issues_chain
        raise AssertionError(f"unexpected table: {name}")

    mock_supabase.table.side_effect = table_router

    result = list_issues(
        mock_supabase, user_id="u-1", project_id="p-1", status="todo"
    )
    assert len(result) == 2
    assert all(i.status == "todo" for i in result)


def test_list_issues_no_filter(mock_supabase):
    project_chain = MagicMock()
    project_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
        _project_row()
    )
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"role": "member"}
    ]
    issues_chain = MagicMock()
    issues_chain.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = [
        _issue_row()
    ]

    def table_router(name):
        if name == "projects":
            return project_chain
        if name == "workspace_members":
            return members_chain
        if name == "issues":
            return issues_chain
        raise AssertionError(f"unexpected table: {name}")

    mock_supabase.table.side_effect = table_router

    result = list_issues(mock_supabase, user_id="u-1", project_id="p-1")
    assert len(result) == 1


def test_get_issue_member_ok(mock_supabase):
    issues_chain = MagicMock()
    issues_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
        _issue_row()
    )
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"role": "member"}
    ]

    def table_router(name):
        if name == "issues":
            return issues_chain
        if name == "workspace_members":
            return members_chain
        raise AssertionError(f"unexpected table: {name}")

    mock_supabase.table.side_effect = table_router

    result = get_issue(mock_supabase, user_id="u-1", issue_id="i-1")
    assert result.id == "i-1"


def test_get_issue_not_found(mock_supabase):
    issues_chain = MagicMock()
    issues_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = None

    def table_router(name):
        if name == "issues":
            return issues_chain
        raise AssertionError(f"unexpected table: {name}")

    mock_supabase.table.side_effect = table_router

    with pytest.raises(IssueNotFoundError):
        get_issue(mock_supabase, user_id="u-1", issue_id="missing")


def test_get_issue_non_member_raises(mock_supabase):
    issues_chain = MagicMock()
    issues_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
        _issue_row()
    )
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []

    def table_router(name):
        if name == "issues":
            return issues_chain
        if name == "workspace_members":
            return members_chain
        raise AssertionError(f"unexpected table: {name}")

    mock_supabase.table.side_effect = table_router

    with pytest.raises(IssuePermissionError):
        get_issue(mock_supabase, user_id="u-1", issue_id="i-1")


def test_update_issue_partial_only(mock_supabase):
    """PATCH with only title set should only update title."""
    issues_chain_fetch = MagicMock()
    issues_chain_fetch.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
        _issue_row()
    )
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"role": "member"}
    ]
    issues_chain_update = MagicMock()
    issues_chain_update.update.return_value.eq.return_value.execute.return_value.data = [
        _issue_row(title="Updated")
    ]

    call_count = {"issues": 0}

    def table_router(name):
        if name == "issues":
            call_count["issues"] += 1
            return issues_chain_fetch if call_count["issues"] == 1 else issues_chain_update
        if name == "workspace_members":
            return members_chain
        raise AssertionError(f"unexpected table: {name}")

    mock_supabase.table.side_effect = table_router

    result = update_issue(
        mock_supabase,
        user_id="u-1",
        issue_id="i-1",
        payload=IssueUpdate(title="Updated"),
    )
    assert result.title == "Updated"
    # Verify the update call only included `title`
    update_args = issues_chain_update.update.call_args[0][0]
    assert update_args == {"title": "Updated"}


def test_update_issue_empty_payload_returns_unchanged(mock_supabase):
    issues_chain = MagicMock()
    issues_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
        _issue_row()
    )
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"role": "member"}
    ]

    def table_router(name):
        if name == "issues":
            return issues_chain
        if name == "workspace_members":
            return members_chain
        raise AssertionError(f"unexpected table: {name}")

    mock_supabase.table.side_effect = table_router

    result = update_issue(
        mock_supabase,
        user_id="u-1",
        issue_id="i-1",
        payload=IssueUpdate(),  # nothing set
    )
    assert result.id == "i-1"
    # No .update(...) chain should have been invoked
    update_calls = [
        c for c in mock_supabase.method_calls if c[0] == "table().update"
    ]
    assert update_calls == []


def test_delete_issue_happy_path(mock_supabase):
    issues_chain_fetch = MagicMock()
    issues_chain_fetch.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
        _issue_row()
    )
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"role": "member"}
    ]
    issues_chain_delete = MagicMock()
    issues_chain_delete.delete.return_value.eq.return_value.execute.return_value.data = []

    call_count = {"issues": 0}

    def table_router(name):
        if name == "issues":
            call_count["issues"] += 1
            return issues_chain_fetch if call_count["issues"] == 1 else issues_chain_delete
        if name == "workspace_members":
            return members_chain
        raise AssertionError(f"unexpected table: {name}")

    mock_supabase.table.side_effect = table_router

    result = delete_issue(mock_supabase, user_id="u-1", issue_id="i-1")
    assert result is None
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd /Users/alanwang/MyFiles/Project/tracker/backend && uv run pytest tests/test_issues_service.py -v
```
Expected: ImportError (no `app.services.issues` yet).

- [ ] **Step 3: Implement `services/issues.py`**

`backend/app/services/issues.py`:
```python
"""Issue business logic.

Service functions take an admin Supabase client and the acting user_id.
Membership against the project's workspace is verified explicitly before
any write. RLS is defense-in-depth.
"""

from supabase import Client

from app.schemas.issue import (
    IssueCreate,
    IssueResponse,
    IssueUpdate,
)


class IssueError(Exception):
    pass


class IssueNotFoundError(IssueError):
    pass


class IssuePermissionError(IssueError):
    pass


class ProjectNotFoundError(IssueError):
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


def _fetch_project(supabase: Client, project_id: str) -> dict | None:
    return (
        supabase.table("projects")
        .select("*")
        .eq("id", project_id)
        .single()
        .execute()
        .data
    )


def create_issue(
    supabase: Client,
    *,
    user_id: str,
    project_id: str,
    payload: IssueCreate,
) -> IssueResponse:
    project = _fetch_project(supabase, project_id)
    if not project:
        raise ProjectNotFoundError(project_id)
    if not _is_member(
        supabase, user_id=user_id, workspace_id=project["workspace_id"]
    ):
        raise IssuePermissionError(project_id)

    result = supabase.rpc(
        "create_issue_with_identifier",
        {
            "p_workspace_id": project["workspace_id"],
            "p_project_id": project_id,
            "p_title": payload.title,
            "p_description": payload.description,
            "p_priority": payload.priority,
            "p_status": payload.status,
            "p_assignee_id": payload.assignee_id,
            "p_due_date": payload.due_date.isoformat() if payload.due_date else None,
            "p_reporter_id": user_id,
        },
    ).execute()

    return IssueResponse(**result.data)


def list_issues(
    supabase: Client,
    *,
    user_id: str,
    project_id: str,
    status: str | None = None,
) -> list[IssueResponse]:
    project = _fetch_project(supabase, project_id)
    if not project:
        raise ProjectNotFoundError(project_id)
    if not _is_member(
        supabase, user_id=user_id, workspace_id=project["workspace_id"]
    ):
        raise IssuePermissionError(project_id)

    query = (
        supabase.table("issues")
        .select("*")
        .eq("project_id", project_id)
    )
    if status:
        query = query.eq("status", status)
    rows = query.order("created_at", desc=True).limit(200).execute().data
    return [IssueResponse(**r) for r in rows]


def get_issue(
    supabase: Client, *, user_id: str, issue_id: str
) -> IssueResponse:
    row = (
        supabase.table("issues")
        .select("*")
        .eq("id", issue_id)
        .single()
        .execute()
        .data
    )
    if not row:
        raise IssueNotFoundError(issue_id)
    if not _is_member(
        supabase, user_id=user_id, workspace_id=row["workspace_id"]
    ):
        raise IssuePermissionError(issue_id)
    return IssueResponse(**row)


def update_issue(
    supabase: Client,
    *,
    user_id: str,
    issue_id: str,
    payload: IssueUpdate,
) -> IssueResponse:
    current = get_issue(supabase, user_id=user_id, issue_id=issue_id)

    updates = payload.model_dump(exclude_unset=True)
    # Serialize date to ISO string for Postgres
    if "due_date" in updates and updates["due_date"] is not None:
        updates["due_date"] = updates["due_date"].isoformat()
    if not updates:
        return current

    updated = (
        supabase.table("issues")
        .update(updates)
        .eq("id", issue_id)
        .execute()
        .data[0]
    )
    return IssueResponse(**updated)


def delete_issue(
    supabase: Client, *, user_id: str, issue_id: str
) -> None:
    # Reuse get_issue's not-found + membership checks
    get_issue(supabase, user_id=user_id, issue_id=issue_id)
    supabase.table("issues").delete().eq("id", issue_id).execute()
```

- [ ] **Step 4: Run tests, confirm pass**

```bash
cd /Users/alanwang/MyFiles/Project/tracker/backend && uv run pytest tests/test_issues_service.py -v
```
Expected: 11 PASSED.

- [ ] **Step 5: Full suite green**

```bash
uv run pytest -q
```
Expected: all previous tests + 11 new = 57 passed.

- [ ] **Step 6: Commit**

```bash
cd /Users/alanwang/MyFiles/Project/tracker
git add backend/app/services/issues.py backend/tests/test_issues_service.py
git commit -m "feat(api): add issues service layer with RPC-based identifier allocation"
```

---

### Task 4: Backend — issues router

**Files:**
- Create: `backend/app/routers/issues.py`
- Create: `backend/tests/test_issues_router.py`
- Modify: `backend/app/main.py` (mount router)

- [ ] **Step 1: Write router tests**

`backend/tests/test_issues_router.py`:
```python
from unittest.mock import patch

from app.schemas.issue import IssueResponse


def _r(**over):
    base = dict(
        id="i-1",
        workspace_id="ws-1",
        project_id="p-1",
        sprint_id=None,
        parent_id=None,
        identifier="BE-1",
        title="Test",
        description="",
        status="backlog",
        priority="no_priority",
        assignee_id=None,
        reporter_id="u-1",
        due_date=None,
        position=0.0,
        created_at="2026-05-14T00:00:00Z",
        updated_at="2026-05-14T00:00:00Z",
    )
    base.update(over)
    return IssueResponse(**base)


def test_list_issues_200(client, make_token):
    with patch("app.routers.issues.list_issues", return_value=[_r()]):
        token = make_token(sub="u-1")
        response = client.get(
            "/projects/p-1/issues",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        assert len(response.json()) == 1


def test_list_issues_status_filter(client, make_token):
    captured = {}

    def fake_list(supabase, *, user_id, project_id, status=None):
        captured["status"] = status
        return []

    with patch("app.routers.issues.list_issues", side_effect=fake_list):
        token = make_token(sub="u-1")
        response = client.get(
            "/projects/p-1/issues?status=todo",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        assert captured["status"] == "todo"


def test_list_issues_403_non_member(client, make_token):
    from app.services.issues import IssuePermissionError
    with patch(
        "app.routers.issues.list_issues",
        side_effect=IssuePermissionError("p-1"),
    ):
        token = make_token(sub="outsider")
        response = client.get(
            "/projects/p-1/issues",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 403


def test_create_issue_201(client, make_token):
    with patch("app.routers.issues.create_issue", return_value=_r(title="New")):
        token = make_token(sub="u-1")
        response = client.post(
            "/projects/p-1/issues",
            json={"title": "New"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 201
        assert response.json()["identifier"] == "BE-1"


def test_create_issue_403(client, make_token):
    from app.services.issues import IssuePermissionError
    with patch(
        "app.routers.issues.create_issue",
        side_effect=IssuePermissionError("p-1"),
    ):
        token = make_token(sub="outsider")
        response = client.post(
            "/projects/p-1/issues",
            json={"title": "X"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 403


def test_create_issue_404_project_not_found(client, make_token):
    from app.services.issues import ProjectNotFoundError
    with patch(
        "app.routers.issues.create_issue",
        side_effect=ProjectNotFoundError("p-1"),
    ):
        token = make_token(sub="u-1")
        response = client.post(
            "/projects/missing/issues",
            json={"title": "X"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 404


def test_get_issue_200(client, make_token):
    with patch("app.routers.issues.get_issue", return_value=_r()):
        token = make_token(sub="u-1")
        response = client.get(
            "/issues/i-1", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200


def test_get_issue_404(client, make_token):
    from app.services.issues import IssueNotFoundError
    with patch(
        "app.routers.issues.get_issue",
        side_effect=IssueNotFoundError("i-1"),
    ):
        token = make_token(sub="u-1")
        response = client.get(
            "/issues/missing", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 404


def test_patch_issue_200(client, make_token):
    with patch(
        "app.routers.issues.update_issue", return_value=_r(title="Renamed")
    ):
        token = make_token(sub="u-1")
        response = client.patch(
            "/issues/i-1",
            json={"title": "Renamed"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        assert response.json()["title"] == "Renamed"


def test_delete_issue_204(client, make_token):
    with patch("app.routers.issues.delete_issue", return_value=None):
        token = make_token(sub="u-1")
        response = client.delete(
            "/issues/i-1", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 204
```

- [ ] **Step 2: Run, confirm fail**

```bash
cd /Users/alanwang/MyFiles/Project/tracker/backend && uv run pytest tests/test_issues_router.py -v
```
Expected: AttributeError (no `app.routers.issues` yet).

- [ ] **Step 3: Implement `routers/issues.py`**

`backend/app/routers/issues.py`:
```python
from fastapi import APIRouter, Depends, HTTPException, Query, status
from supabase import Client

from app.core.deps import get_current_user_id, get_supabase_admin
from app.schemas.issue import (
    IssueCreate,
    IssueResponse,
    IssueStatus,
    IssueUpdate,
)
from app.services.issues import (
    IssueNotFoundError,
    IssuePermissionError,
    ProjectNotFoundError,
    create_issue,
    delete_issue,
    get_issue,
    list_issues,
    update_issue,
)

router = APIRouter(tags=["issues"])


@router.get(
    "/projects/{p_id}/issues", response_model=list[IssueResponse]
)
def list_(
    p_id: str,
    # Aliased so the URL param is `?status=` but the local name is `status_filter`,
    # avoiding the shadow with the FastAPI `status` module.
    status_filter: IssueStatus | None = Query(None, alias="status"),
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return list_issues(
            supabase, user_id=user_id, project_id=p_id, status=status_filter
        )
    except IssuePermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.post(
    "/projects/{p_id}/issues",
    response_model=IssueResponse,
    status_code=status.HTTP_201_CREATED,
)
def create(
    p_id: str,
    payload: IssueCreate,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return create_issue(
            supabase, user_id=user_id, project_id=p_id, payload=payload
        )
    except IssuePermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.get("/issues/{i_id}", response_model=IssueResponse)
def get(
    i_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return get_issue(supabase, user_id=user_id, issue_id=i_id)
    except IssuePermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except IssueNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.patch("/issues/{i_id}", response_model=IssueResponse)
def update(
    i_id: str,
    payload: IssueUpdate,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        return update_issue(
            supabase, user_id=user_id, issue_id=i_id, payload=payload
        )
    except IssuePermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except IssueNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.delete("/issues/{i_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(
    i_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
):
    try:
        delete_issue(supabase, user_id=user_id, issue_id=i_id)
    except IssuePermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except IssueNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
```

- [ ] **Step 4: Mount router in `main.py`**

Edit `backend/app/main.py`. Change the import line from:
```python
from app.routers import me, members, projects, workspaces
```
to:
```python
from app.routers import issues, me, members, projects, workspaces
```
and add (next to the other `include_router` calls):
```python
app.include_router(issues.router)
```

- [ ] **Step 5: Run tests, full suite**

```bash
cd /Users/alanwang/MyFiles/Project/tracker/backend && uv run pytest -q
```
Expected: 57 previous + 10 new = 67 passed.

- [ ] **Step 6: Commit**

```bash
cd /Users/alanwang/MyFiles/Project/tracker
git add backend/
git commit -m "feat(api): add issues router (CRUD endpoints)"
```

---

### Task 5: Frontend — issues API hooks

**Files:**
- Create: `frontend/src/features/issues/api.ts`

- [ ] **Step 1: Create `features/issues/api.ts`**

`frontend/src/features/issues/api.ts`:
```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/api/client";

export type IssueStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "in_review"
  | "done"
  | "cancelled";

export type IssuePriority =
  | "no_priority"
  | "urgent"
  | "high"
  | "medium"
  | "low";

export type Issue = {
  id: string;
  workspace_id: string;
  project_id: string;
  sprint_id: string | null;
  parent_id: string | null;
  identifier: string;
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  assignee_id: string | null;
  reporter_id: string | null;
  due_date: string | null; // ISO date
  position: number;
  created_at: string;
  updated_at: string;
};

export type IssueCreate = {
  title: string;
  description?: string;
  status?: IssueStatus;
  priority?: IssuePriority;
  assignee_id?: string | null;
  due_date?: string | null;
};

export type IssueUpdate = Partial<{
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  assignee_id: string | null;
  due_date: string | null;
}>;

export function useIssues(projectId: string, opts: { status?: IssueStatus } = {}) {
  return useQuery<Issue[]>({
    queryKey: ["projects", projectId, "issues", opts],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (opts.status) params.set("status", opts.status);
      const qs = params.toString();
      const { data } = await apiClient.get<Issue[]>(
        `/projects/${projectId}/issues${qs ? `?${qs}` : ""}`,
      );
      return data;
    },
    enabled: !!projectId,
  });
}

export function useIssue(issueId: string) {
  return useQuery<Issue>({
    queryKey: ["issues", issueId],
    queryFn: async () => {
      const { data } = await apiClient.get<Issue>(`/issues/${issueId}`);
      return data;
    },
    enabled: !!issueId,
  });
}

export function useCreateIssue(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: IssueCreate) => {
      const { data } = await apiClient.post<Issue>(
        `/projects/${projectId}/issues`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", projectId, "issues"] });
    },
  });
}

export function useUpdateIssue(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: IssueUpdate) => {
      const { data } = await apiClient.patch<Issue>(
        `/issues/${issueId}`,
        payload,
      );
      return data;
    },
    onSuccess: (issue) => {
      qc.setQueryData(["issues", issueId], issue);
      // Invalidate any list this issue might appear in
      qc.invalidateQueries({
        queryKey: ["projects", issue.project_id, "issues"],
      });
    },
  });
}

export function useDeleteIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (issueId: string) => {
      await apiClient.delete(`/issues/${issueId}`);
    },
    onSuccess: () => {
      // Issues lists across projects might need invalidating, but in Plan 3
      // the delete is always called from within a project context.
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
```

- [ ] **Step 2: tsc**

```bash
cd /Users/alanwang/MyFiles/Project/tracker/frontend && pnpm tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/alanwang/MyFiles/Project/tracker
git add frontend/src/features/issues/
git commit -m "feat(web): add issues API hooks"
```

---

### Task 6: Frontend — IssueList page

**Files:**
- Create: `frontend/src/pages/IssueList.tsx`

The page is a Card with a header (project name + identifier prefix + New Issue button), a status filter dropdown, and a table. Inline create form same as `WorkspaceHome` pattern. Status/priority shown as small pills.

- [ ] **Step 1: Create the page**

`frontend/src/pages/IssueList.tsx`:
```tsx
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  IssueStatus,
  useCreateIssue,
  useIssues,
} from "@/features/issues/api";
import { useProjects } from "@/features/projects/api";
import { useWorkspaces } from "@/features/workspaces/api";

const STATUS_LABELS: Record<IssueStatus | "all", string> = {
  all: "All",
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In progress",
  in_review: "In review",
  done: "Done",
  cancelled: "Cancelled",
};

const STATUS_OPTIONS: (IssueStatus | "all")[] = [
  "all",
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "cancelled",
];

const PRIORITY_LABELS = {
  no_priority: "—",
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
} as const;

export default function IssueList() {
  const { wsSlug, pKey } = useParams();
  const navigate = useNavigate();

  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const { data: projects = [] } = useProjects(currentWs?.id ?? "");
  const currentProject = projects.find((p) => p.key === pKey);

  const [statusFilter, setStatusFilter] = useState<IssueStatus | "all">("all");
  const {
    data: issues = [],
    isLoading,
  } = useIssues(currentProject?.id ?? "", {
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const createMutation = useCreateIssue(currentProject?.id ?? "");
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const sortedIssues = useMemo(
    () =>
      [...issues].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [issues],
  );

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!currentProject) return;
    try {
      const issue = await createMutation.mutateAsync({ title, description });
      toast.success(`Created ${issue.identifier}`);
      setShowForm(false);
      setTitle("");
      setDescription("");
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to create issue";
      toast.error(detail);
    }
  }

  if (!currentProject) return null;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase text-muted-foreground">
            {currentProject.key}
          </p>
          <h1 className="text-2xl font-bold text-slate-900">
            {currentProject.name}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as IssueStatus | "all")
            }
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <Button onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "New issue"}
          </Button>
        </div>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>New issue</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onCreate} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="issue-title">Title</Label>
                <Input
                  id="issue-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  minLength={1}
                  maxLength={200}
                  placeholder="Set up authentication"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="issue-desc">Description</Label>
                <textarea
                  id="issue-desc"
                  className="w-full rounded border border-slate-300 bg-white p-2 text-sm"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={10000}
                />
              </div>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : "Create"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading && <p>Loading issues…</p>}
      {!isLoading && sortedIssues.length === 0 && (
        <p className="text-muted-foreground">
          No issues yet. Click "New issue" to create one.
        </p>
      )}
      {sortedIssues.length > 0 && (
        <div className="overflow-hidden rounded border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium">ID</th>
                <th className="px-3 py-2 text-left font-medium">Title</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Priority</th>
                <th className="px-3 py-2 text-left font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {sortedIssues.map((i) => (
                <tr
                  key={i.id}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                  onClick={() =>
                    navigate(`/w/${wsSlug}/p/${pKey}/issues/${i.identifier}`)
                  }
                >
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">
                    {i.identifier}
                  </td>
                  <td className="px-3 py-2">{i.title}</td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">
                      {STATUS_LABELS[i.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {PRIORITY_LABELS[i.priority]}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(i.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: tsc**

```bash
cd /Users/alanwang/MyFiles/Project/tracker/frontend && pnpm tsc --noEmit
```
Expected: clean. (The page is not mounted in routes yet — that's the next task — but the file should type-check on its own.)

- [ ] **Step 3: Commit**

```bash
cd /Users/alanwang/MyFiles/Project/tracker
git add frontend/src/pages/IssueList.tsx
git commit -m "feat(web): add IssueList page (table + status filter + create form)"
```

---

### Task 7: Frontend — IssueDetail page

**Files:**
- Create: `frontend/src/pages/IssueDetail.tsx`

Inline-editable fields. Pattern: `useIssue` for read, `useUpdateIssue` for each blur/change. Title is contenteditable-on-click; status and priority are dropdowns; description is a textarea (saves on blur). Delete button at bottom.

- [ ] **Step 1: Create the page**

`frontend/src/pages/IssueDetail.tsx`:
```tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  IssuePriority,
  IssueStatus,
  useDeleteIssue,
  useIssue,
  useIssues,
  useUpdateIssue,
} from "@/features/issues/api";
import { useProjects } from "@/features/projects/api";
import { useWorkspaces } from "@/features/workspaces/api";

const STATUSES: IssueStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "cancelled",
];

const PRIORITIES: IssuePriority[] = [
  "no_priority",
  "urgent",
  "high",
  "medium",
  "low",
];

export default function IssueDetail() {
  const { wsSlug, pKey, identifier } = useParams();
  const navigate = useNavigate();

  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const { data: projects = [] } = useProjects(currentWs?.id ?? "");
  const currentProject = projects.find((p) => p.key === pKey);

  // Resolve identifier → issue via the project's list, then fetch the
  // canonical record via /issues/{id}.
  const { data: issuesList = [] } = useIssues(currentProject?.id ?? "");
  const issueFromList = issuesList.find((i) => i.identifier === identifier);
  const { data: issue } = useIssue(issueFromList?.id ?? "");

  const updateMutation = useUpdateIssue(issue?.id ?? "");
  const deleteMutation = useDeleteIssue();

  const [titleDraft, setTitleDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");

  useEffect(() => {
    if (issue) {
      setTitleDraft(issue.title);
      setDescDraft(issue.description);
    }
  }, [issue]);

  if (!issue) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  async function save<K extends keyof typeof issue>(
    field: K,
    value: (typeof issue)[K],
  ) {
    try {
      await updateMutation.mutateAsync({ [field]: value } as never);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to update";
      toast.error(detail);
    }
  }

  async function onDelete() {
    if (!confirm(`Delete ${issue.identifier}?`)) return;
    try {
      await deleteMutation.mutateAsync(issue.id);
      toast.success("Issue deleted");
      navigate(`/w/${wsSlug}/p/${pKey}/list`);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to delete";
      toast.error(detail);
    }
  }

  return (
    <div className="grid grid-cols-3 gap-8 max-w-6xl">
      <div className="col-span-2 space-y-4">
        <p className="font-mono text-xs text-muted-foreground">
          {issue.identifier}
        </p>
        <input
          className="w-full bg-transparent text-2xl font-bold text-slate-900 outline-none focus:bg-slate-100 rounded px-1 py-0.5 -mx-1"
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => {
            if (titleDraft !== issue.title && titleDraft.length > 0) {
              save("title", titleDraft);
            }
          }}
        />
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Description
          </p>
          <textarea
            className="w-full rounded border border-slate-200 bg-white p-2 text-sm"
            rows={8}
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            onBlur={() => {
              if (descDraft !== issue.description) {
                save("description", descDraft);
              }
            }}
          />
        </div>
        <Button
          variant="outline"
          onClick={onDelete}
          disabled={deleteMutation.isPending}
          className="text-red-600 hover:bg-red-50"
        >
          Delete issue
        </Button>
      </div>

      <aside className="space-y-4 border-l border-slate-200 pl-6">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Status
          </p>
          <select
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
            value={issue.status}
            onChange={(e) => save("status", e.target.value as IssueStatus)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Priority
          </p>
          <select
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
            value={issue.priority}
            onChange={(e) => save("priority", e.target.value as IssuePriority)}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Due date
          </p>
          <input
            type="date"
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
            value={issue.due_date ?? ""}
            onChange={(e) =>
              save("due_date", e.target.value === "" ? null : e.target.value)
            }
          />
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Reporter
          </p>
          <p className="text-xs text-slate-500">{issue.reporter_id ?? "—"}</p>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Created
          </p>
          <p className="text-xs text-slate-500">
            {new Date(issue.created_at).toLocaleString()}
          </p>
        </div>
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: tsc**

```bash
cd /Users/alanwang/MyFiles/Project/tracker/frontend && pnpm tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/alanwang/MyFiles/Project/tracker
git add frontend/src/pages/IssueDetail.tsx
git commit -m "feat(web): add IssueDetail page (inline editing + delete)"
```

---

### Task 8: Frontend — routes + WorkspaceHome card navigation

**Files:**
- Modify: `frontend/src/App.tsx` (add 2 nested routes under `/w/:wsSlug`)
- Modify: `frontend/src/pages/WorkspaceHome.tsx` (project card → `/list`)

- [ ] **Step 1: Update App.tsx**

Replace the contents of `frontend/src/App.tsx` with:
```tsx
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { WorkspaceLayout } from "@/components/WorkspaceLayout";
import AuthCallback from "@/pages/AuthCallback";
import Home from "@/pages/Home";
import IssueDetail from "@/pages/IssueDetail";
import IssueList from "@/pages/IssueList";
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
          <Route path="p/:pKey/list" element={<IssueList />} />
          <Route path="p/:pKey/issues/:identifier" element={<IssueDetail />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: Update WorkspaceHome project card navigation**

In `frontend/src/pages/WorkspaceHome.tsx`, find the `onClick` handler on the project card button (currently `navigate(`/w/${wsSlug}/p/${p.key}`)`) and change it to:

```tsx
onClick={() => navigate(`/w/${wsSlug}/p/${p.key}/list`)}
```

(Only that one line changes. The rest of the file is unchanged.)

- [ ] **Step 3: tsc**

```bash
cd /Users/alanwang/MyFiles/Project/tracker/frontend && pnpm tsc --noEmit
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/alanwang/MyFiles/Project/tracker
git add frontend/src/App.tsx frontend/src/pages/WorkspaceHome.tsx
git commit -m "feat(web): wire issues routes under /w/:wsSlug/p/:pKey"
```

---

### Task 9: E2E — extend workspace.spec.ts with issue flow

**Files:**
- Modify: `frontend/tests/workspace.spec.ts`

Extend the existing serial flow: after creating workspace + project, create an issue, see it in the list, click into detail, change status, navigate back, confirm.

- [ ] **Step 1: Add issue tests at end of existing serial describe**

Open `frontend/tests/workspace.spec.ts`. The existing file has 3 tests inside a `test.describe.serial("workspace + project flow", ...)`. Add the following 3 tests INSIDE the same describe block, after the existing "can create a project in the workspace" test:

```typescript
  test("can create an issue in the project", async () => {
    // Click the project card to navigate into its issues list
    await page.getByText(PROJ_NAME).click();
    await page.waitForURL(`**/p/${PROJ_KEY}/list`, { timeout: 10_000 });

    // Open the create form, fill, submit
    await page.getByRole("button", { name: /new issue/i }).click();
    await page.getByLabel(/^title$/i).fill("First issue");
    await page.getByLabel(/^description$/i).fill("Issue description");
    await page.getByRole("button", { name: /^create$/i }).click();

    // Issue row appears with identifier "BE-1"
    await expect(page.getByText("BE-1")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("First issue")).toBeVisible();
  });

  test("can open issue detail and change status", async () => {
    // We're still on the list page from the previous test
    await page.getByText("First issue").click();
    await page.waitForURL(`**/p/${PROJ_KEY}/issues/BE-1`, {
      timeout: 10_000,
    });

    // Title visible, identifier shown
    await expect(page.getByText("BE-1")).toBeVisible();

    // Change status to "todo"
    // Status is a <select>; the first <select> on the page is the status one
    await page.locator("select").first().selectOption("todo");
    // Wait a beat for the PATCH to round-trip
    await page.waitForTimeout(500);

    // Navigate back
    await page.goBack();
    await page.waitForURL(`**/p/${PROJ_KEY}/list`);

    // Filter to "todo" — should still see BE-1
    await page.locator("select").first().selectOption("todo");
    await expect(page.getByText("BE-1")).toBeVisible({ timeout: 5_000 });
  });

  test("can delete an issue", async () => {
    // Reload the list to ensure we're not in a stale state
    await page.goto(`/w/${WS_SLUG}/p/${PROJ_KEY}/list`);
    // Reset filter to "all" (it was todo from previous test)
    await page.locator("select").first().selectOption("all");
    await page.getByText("First issue").click();
    await page.waitForURL(`**/p/${PROJ_KEY}/issues/BE-1`);

    // Accept the confirm() dialog
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /delete issue/i }).click();

    // Navigated back to list; BE-1 no longer visible
    await page.waitForURL(`**/p/${PROJ_KEY}/list`, { timeout: 10_000 });
    await expect(page.getByText("BE-1")).not.toBeVisible();
  });
```

- [ ] **Step 2: tsc**

```bash
cd /Users/alanwang/MyFiles/Project/tracker/frontend && pnpm tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Skip running E2E**

Do NOT run `pnpm exec playwright test` — the human will run it manually with `make test-e2e` after the plan is fully executed. Running it here could leave stale test users in Supabase.

- [ ] **Step 4: Commit**

```bash
cd /Users/alanwang/MyFiles/Project/tracker
git add frontend/tests/workspace.spec.ts
git commit -m "test(web): extend E2E with issue create/edit/delete flow"
```

---

## Done When

- [ ] All 9 tasks complete and committed.
- [ ] `make test` passes (backend pytest + tsc).
- [ ] `make test-e2e` passes when run manually (auth + workspace + 3 new issue tests = 8 E2E tests).
- [ ] Browser flow works end-to-end:
  - Sign in → /w/test → click "Backend" project → /w/test/p/BE/list opens with empty state
  - New issue "Set up auth" → appears as BE-1 in the list
  - Click row → BE-1 detail page → change status to "in_progress" → save
  - Reload list → BE-1 shows "in_progress"
- [ ] `supabase db reset` cleanly applies all three migrations.
- [ ] No browser console errors on any of the new routes.

## What's Next

Plan 4: **Sprints**
- `sprints` table with status (planned/active/completed), start_at, end_at, name
- Add the deferred FK on `issues.sprint_id`
- Sprint picker on issue create/detail
- `/w/:wsSlug/p/:pKey/sprints` and `/sprints/:id` views
- `POST /sprints/:id/start` and `/complete` with the auto-rollover behavior from spec section 6
- Backlog view (issues with no sprint) at `/w/:wsSlug/p/:pKey/backlog`

After Plan 4, you'll be able to organize issues into sprints and run a planning workflow.
