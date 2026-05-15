# Sprints — Design (Plan 4)

## Goal

A workspace member can create sprints inside a project, add issues to a sprint (via the issue detail's sprint picker), view the sprint list with status grouping (planned / active / completed), start a sprint (planned → active), and complete a sprint with auto-rollover of unfinished issues to the next planned sprint (or back to backlog if none). The backlog view shows issues with no sprint assigned.

## Scope

### In scope
- `sprints` table + `sprint_status` enum (planned / active / completed) + RLS + partial unique index enforcing "one active sprint per project"
- Deferred FK from Plan 3: `ALTER TABLE issues ADD CONSTRAINT issues_sprint_id_fkey FOREIGN KEY (sprint_id) REFERENCES sprints(id) ON DELETE SET NULL`
- Atomic `complete_sprint(p_sprint_id uuid)` RPC that runs the rollover logic in a transaction. Returns `(completed_sprint_id, rolled_over_to_sprint_id, count)`.
- 7 endpoints (matching spec section 343-352):
  - `POST /projects/{p_id}/sprints` — create (default status='planned')
  - `GET /projects/{p_id}/sprints` — list, sorted by status priority (active first, then planned, then completed) + start_at
  - `GET /sprints/{s_id}` — get
  - `PATCH /sprints/{s_id}` — partial update (name, start_at, end_at) — status changes go through start/complete endpoints
  - `DELETE /sprints/{s_id}` — plain delete (issues' sprint_id → NULL via FK on delete)
  - `POST /sprints/{s_id}/start` — planned → active. 422 if not planned. 422 if another active sprint exists in the project (also enforced by unique index).
  - `POST /sprints/{s_id}/complete` — active → completed, with auto-rollover. 422 if not active.
- Pydantic schemas: `SprintCreate`, `SprintUpdate`, `SprintResponse`, plus `SprintStatus` Literal
- Service-layer endpoints + tests
- Add `?sprint=null|<uuid>` query param to existing `GET /projects/{p_id}/issues` for backlog filter + per-sprint filter
- Service-layer `_is_member` helper reused (same pattern as Plan 2/3)
- Frontend:
  - `useSprints(projectId)`, `useSprint(sprintId)`, `useCreateSprint(projectId)`, `useUpdateSprint(sprintId)`, `useDeleteSprint`, `useStartSprint`, `useCompleteSprint`
  - Page `/w/:wsSlug/p/:pKey/sprints` — sprint list grouped by status with create form. Click → sprint detail.
  - Page `/w/:wsSlug/p/:pKey/sprints/:sprintId` — sprint detail: name, dates, status, status-transition buttons, issues table (reuses display from IssueList).
  - Page `/w/:wsSlug/p/:pKey/backlog` — issues with `sprint_id IS NULL`, using `useIssues(projectId, {sprint: 'null'})` variant.
  - IssueDetail aside: sprint picker (`<select>` listing project's active+planned sprints + "Backlog"). Saves via PATCH /issues/{id}.
  - WorkspaceLayout sidebar: add Sprints + Backlog navigation links (when in project scope — but Plan 4 keeps the sidebar simple; just adds to nav).

### Deferred to Plan 5+
- Sprint detail's burndown chart / velocity / daily report (Plan 11 polish)
- Sprint planning view (`/backlog` two-column drag-and-drop) — Plan 7 (Kanban)
- Sprint name uniqueness within project (allowed in Plan 4; multiple "Sprint 1" rows OK)
- Editing start_at on an active sprint (allowed in Plan 4; no validation that start_at < end_at)
- Notifying users when sprint starts/completes — Plan 8 (notifications)
- Sprint-level kanban — Plan 7

## Data model

```sql
create type sprint_status as enum ('planned', 'active', 'completed');

create table sprints (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  status sprint_status not null default 'planned',
  start_at timestamptz,
  end_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sprints_project_id_status_idx on sprints (project_id, status);

-- Enforce: at most one 'active' sprint per project.
create unique index sprints_one_active_per_project
  on sprints (project_id)
  where status = 'active';

create trigger sprints_set_updated_at
  before update on sprints
  for each row execute function set_updated_at();

-- Deferred FK from Plan 3.
alter table issues
  add constraint issues_sprint_id_fkey
  foreign key (sprint_id) references sprints(id) on delete set null;

-- RLS: same pattern as Plan 2/3.
alter table sprints enable row level security;

-- Note: sprints table has no workspace_id column. Membership is checked via
-- the project's workspace. RLS policies use a subquery against projects to
-- get workspace_id, then is_workspace_member(...).
create policy "members can read project sprints"
  on sprints for select
  using (is_workspace_member((select workspace_id from projects where id = project_id)));

create policy "members can insert project sprints"
  on sprints for insert
  with check (is_workspace_member((select workspace_id from projects where id = project_id)));

create policy "members can update project sprints"
  on sprints for update
  using (is_workspace_member((select workspace_id from projects where id = project_id)))
  with check (is_workspace_member((select workspace_id from projects where id = project_id)));

create policy "members can delete project sprints"
  on sprints for delete
  using (is_workspace_member((select workspace_id from projects where id = project_id)));
```

## complete_sprint RPC

```sql
create or replace function complete_sprint(p_sprint_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sprint sprints;
  v_next_planned_id uuid;
  v_rolled_count int;
begin
  -- Lock + verify sprint is active
  select * into v_sprint from sprints where id = p_sprint_id for update;
  if v_sprint.id is null then
    raise exception 'sprint not found' using errcode = 'P0002';
  end if;
  if v_sprint.status != 'active' then
    raise exception 'sprint is not active' using errcode = 'P0001';
  end if;

  -- Find the next planned sprint in same project, ordered by start_at asc, nulls last
  select id into v_next_planned_id
  from sprints
  where project_id = v_sprint.project_id
    and status = 'planned'
  order by start_at asc nulls last, created_at asc
  limit 1;

  -- Roll over unfinished issues
  update issues
  set sprint_id = v_next_planned_id  -- can be NULL → back to backlog
  where sprint_id = p_sprint_id
    and status not in ('done', 'cancelled');

  get diagnostics v_rolled_count = row_count;

  -- Mark sprint completed
  update sprints set status = 'completed' where id = p_sprint_id;

  return jsonb_build_object(
    'completed', p_sprint_id,
    'rolled_over_to', v_next_planned_id,
    'count', v_rolled_count
  );
end;
$$;

revoke execute on function complete_sprint(uuid) from public, anon, authenticated;
```

Service calls `supabase.rpc("complete_sprint", {"p_sprint_id": ...}).execute()`. Caller still validates workspace membership.

## Start sprint behavior

`POST /sprints/{s_id}/start` is simpler — just an UPDATE with status transition + unique-index check. No RPC needed.

```python
# service: start_sprint
def start_sprint(supabase, *, user_id, sprint_id):
    sprint = fetch_sprint_with_membership_check(...)
    if sprint["status"] != "planned":
        raise SprintInvalidTransitionError(sprint_id)
    try:
        updated = supabase.table("sprints").update({"status": "active"}).eq("id", sprint_id).execute().data[0]
    except APIError as exc:
        if exc.code == "23505":  # unique index violation
            raise AnotherActiveSprintError(sprint["project_id"]) from exc
        raise
    return SprintResponse(**updated)
```

## API contract

**POST /projects/{p_id}/sprints**
- Body: `{ name: str (1-100), start_at?: datetime, end_at?: datetime }`
- Response 201: `SprintResponse`, status=planned by default
- Errors: 403 / 404 (project)

**GET /projects/{p_id}/sprints**
- Response 200: `list[SprintResponse]` sorted: active first, then planned (by start_at asc), then completed (by end_at desc)
- Errors: 403 / 404

**GET /sprints/{s_id}** / **PATCH /sprints/{s_id}** / **DELETE /sprints/{s_id}**
- Membership via the sprint's project's workspace.
- PATCH body: `{ name?: str, start_at?: datetime, end_at?: datetime }` (status changes go through start/complete)
- Errors: 403 / 404

**POST /sprints/{s_id}/start** — 200 returns updated SprintResponse. 422 if not planned or already-active conflict.

**POST /sprints/{s_id}/complete** — 200 returns `{ completed: uuid, rolled_over_to: uuid|null, count: int }`. 422 if not active.

**GET /projects/{p_id}/issues?sprint=null|<uuid>** — extend existing endpoint.
- `?sprint=null` returns issues where `sprint_id IS NULL` (backlog).
- `?sprint=<uuid>` returns issues for that sprint.
- Omitted = all issues in project (current behavior).

## Frontend

### Routes added in App.tsx
```tsx
<Route path="p/:pKey/sprints" element={<SprintList />} />
<Route path="p/:pKey/sprints/:sprintId" element={<SprintDetail />} />
<Route path="p/:pKey/backlog" element={<Backlog />} />
```

### SprintList page
- Three sections: Active, Planned, Completed. Each shows sprints as cards (name + date range + issue count).
- "New sprint" button → inline form: name (required) + start_at + end_at.
- Active section has at most 1 sprint.
- Click sprint card → SprintDetail.

### SprintDetail page
- Header: sprint name (editable inline), status pill, dates.
- Status-transition buttons:
  - If planned: "Start sprint" button
  - If active: "Complete sprint" button (confirm dialog showing what will roll over)
- Body: issues in this sprint, reused IssueList table (without status filter — sprint scope replaces it).
- Delete button if status != active.

### Backlog page
- Shows issues with `sprint_id IS NULL`. Same table as IssueList but title="Backlog".
- Each row has a quick-add-to-sprint dropdown (active+planned sprints in project).

### IssueDetail sprint picker
- New aside field "Sprint": `<select>` with options = "None" + all active/planned sprints in project. Save on change via PATCH (existing useUpdateIssue accepts sprint_id).

### IssueUpdate type addition
- Add `sprint_id: string | null` to `IssueUpdate` TS type and Pydantic schema. Backend already accepts arbitrary key in `update_issue.model_dump(exclude_unset=True)` so the service-layer change is trivial (just add `sprint_id` to the Update schema field list).

### WorkspaceLayout sidebar (in project scope)
- Plan 4 keeps the sidebar nav simple. Adds two links visible when inside `/w/:wsSlug/p/:pKey/*`:
  - "Sprints" → /sprints
  - "Backlog" → /backlog
- Requires WorkspaceLayout to detect project scope (via route params). Easier: don't put them in the sidebar yet — leave the project nav at /list (issues) for now, and let users navigate to /sprints and /backlog via URL or links from SprintDetail. Defer sidebar enhancement to Plan 11 polish.

Decision: **defer sidebar links**. Just add /sprints and /backlog as routes; users navigate via SprintDetail back-links or browser URL. The IssueDetail sprint picker handles the most common case (assign issue to sprint).

## Testing

- Service tests: sprints CRUD (mocked supabase), start_sprint state machine, complete_sprint mocked RPC, list_issues with sprint filter.
- Router tests: 7 endpoints + the new issues filter param.
- E2E: defer. The existing workspace.spec.ts is already getting long; Plan 4 manual smoke is fine.

## File structure (new/modified)

```
backend/
  app/
    schemas/sprint.py                # NEW
    services/sprints.py              # NEW
    services/issues.py               # MOD: list_issues accepts sprint filter
    schemas/issue.py                 # MOD: IssueUpdate adds sprint_id
    routers/sprints.py               # NEW
    routers/issues.py                # MOD: list_ accepts ?sprint= query param
    main.py                          # MOD: mount sprints router
  tests/
    test_sprints_service.py          # NEW
    test_sprints_router.py           # NEW
    test_issues_service.py           # MOD: add sprint filter tests
    test_issues_router.py            # MOD: add sprint filter tests

supabase/
  migrations/
    20260517000000_sprints.sql       # NEW (sprints table + enum + RLS + complete_sprint RPC + issues.sprint_id FK)

frontend/
  src/
    features/sprints/api.ts          # NEW
    features/issues/api.ts           # MOD: useIssues opts adds sprint param; IssueUpdate adds sprint_id
    pages/SprintList.tsx             # NEW
    pages/SprintDetail.tsx           # NEW
    pages/Backlog.tsx                # NEW
    pages/IssueDetail.tsx            # MOD: sprint picker in aside
    App.tsx                          # MOD: add 3 routes
```

## Open decisions taken

1. `sprints` has no `workspace_id` column — derived via `projects.workspace_id`. Saves a denormalization but RLS policies need a subquery. Plan 2 chose denormalization for `issues.workspace_id` (faster RLS lookup). Plan 4 trades that for less data duplication; the policy subquery is acceptable since sprints are listed less often than issues.
2. `complete_sprint` RPC is locked down (`REVOKE EXECUTE FROM PUBLIC, anon, authenticated`) same as Plan 3's `create_issue_with_identifier`.
3. PATCH /sprints/{s_id} accepts only name/start_at/end_at. Status changes are exclusively via start/complete. This forces clients to use the state-machine endpoints (with rollover semantics) rather than silently bypassing.
4. Deleting an active sprint is allowed (Plan 4); issues' sprint_id sets to NULL. Could restrict, but adding a constraint adds friction during dev. Plan 11 polish revisits.
5. `start_sprint` 422 errors use FastAPI's default `{"detail": "..."}` shape. Plan 11 may standardize error envelopes.

## What this unblocks for later plans

- Plan 7 (Kanban): Board view defaults to "current active sprint" — uses `GET /projects/{p}/issues?sprint=<active_sprint_id>`.
- Plan 11 polish: sidebar nav for Sprints/Backlog inside project scope.
