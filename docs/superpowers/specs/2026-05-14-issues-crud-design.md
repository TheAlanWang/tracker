# Issues CRUD + List View — Design (Plan 3)

## Goal

A workspace member can open a project, see its issues in a list, create new issues that get auto-numbered identifiers (e.g. `BE-1`, `BE-2`), open an issue's detail page, and edit its core fields (title, status, priority, description, due_date). Issues are persisted with full schema (all spec fields exist on the table) but features like sub-issues, sprints, comments, labels, relations, and kanban are deferred.

## Scope

### In scope
- `issues` table with all spec fields + RLS policies + indexes
- Two Postgres enums: `issue_status` (backlog/todo/in_progress/in_review/done/cancelled), `issue_priority` (no_priority/urgent/high/medium/low)
- Atomic identifier allocation via a Supabase RPC function that does `UPDATE projects ... RETURNING next_issue_number` + `INSERT INTO issues` in one Postgres transaction. Called from the service layer.
- 5 endpoints under `/projects/{p_id}/issues` and `/issues/{i_id}`:
  - `POST /projects/{p_id}/issues` — create (auto-assigns identifier, reporter_id = caller, defaults: status=backlog, priority=no_priority, assignee=null, parent=null, sprint=null)
  - `GET /projects/{p_id}/issues?status=` — list with optional status filter, sorted by created_at desc
  - `GET /issues/{i_id}` — single issue
  - `PATCH /issues/{i_id}` — partial update (title, description, status, priority, assignee_id, due_date)
  - `DELETE /issues/{i_id}` — plain delete (no cascade choice — sub-issues are always null in Plan 3)
- Pydantic schemas: `IssueCreate`, `IssueUpdate`, `IssueResponse`, plus `IssueStatus` and `IssuePriority` Literals (kept in sync with PG enums via comment)
- Frontend:
  - React Query hooks: `useIssues(projectId, {status?})`, `useIssue(issueId)`, `useCreateIssue(projectId)`, `useUpdateIssue(issueId)`, `useDeleteIssue(issueId)`
  - Route `/w/:wsSlug/p/:pKey/list` → `IssueList` page (table: identifier, title, status, priority, created_at; status filter dropdown; "New issue" button → inline form)
  - Route `/w/:wsSlug/p/:pKey/issues/:identifier` → `IssueDetail` page (inline-editable fields; resolves identifier → issue via list query, no separate by-identifier endpoint in Plan 3)
  - WorkspaceHome project card click navigates to `/w/:wsSlug/p/:pKey/list` (currently dead link to `/p/:pKey`)
- Playwright E2E: extend `workspace.spec.ts` flow — create issue, see in list, open detail, change status.

### Deferred to Plan 4+
- `sprints` table + sprint-related fields/endpoints
- `parent_id` (sub-issues) — column exists in table, always null in Plan 3
- `comments`, `labels`, `issue_labels`, `issue_relations`, `activity_log`, `notifications` tables
- `position` (fractional indexing for kanban order) — column exists, always 0 in Plan 3
- Board (kanban) view, backlog view, sprint list view
- Markdown rendering of `description` (Plan 3 renders as plain text in `<pre>` or `<textarea>`)
- Assignee picker UI (Plan 3 leaves assignee null; PATCH endpoint accepts assignee_id but no UI sets it)
- `/issues/by-identifier/{identifier}` shortcut endpoint (Plan 3 navigates via project list)
- `POST /issues/{i_id}/move` (drag-and-drop atomic move)
- Cmd+K, optimistic updates, realtime subscriptions
- `/dashboard`, `/inbox`, `/my-issues`
- Cascade-on-delete policy choice (`cascade=children|none` query param) — Plan 3 plain delete; revisit when sub-issues land

## Data model

`issues` table (matches spec section 5):
```sql
create type issue_status as enum
  ('backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled');
create type issue_priority as enum
  ('no_priority', 'urgent', 'high', 'medium', 'low');

create table issues (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  sprint_id uuid references sprints(id) on delete set null,  -- nullable; sprints table NOT created in Plan 3, defer FK
  parent_id uuid references issues(id) on delete set null,   -- nullable
  identifier text not null,                                  -- "BE-1"
  title text not null,
  description text default '',
  status issue_status not null default 'backlog',
  priority issue_priority not null default 'no_priority',
  assignee_id uuid references auth.users(id) on delete set null,
  reporter_id uuid not null references auth.users(id) on delete set null,
  due_date date,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, identifier)
);

-- Indexes: list-by-project (status filter), list-by-assignee
create index issues_project_id_status_idx on issues (project_id, status);
create index issues_assignee_id_idx on issues (assignee_id) where assignee_id is not null;

-- updated_at trigger
create trigger issues_set_updated_at
  before update on issues
  for each row execute function set_updated_at();
```

**Important deviation from spec for Plan 3:** `sprint_id` and `parent_id` columns exist but `sprints` table does NOT exist yet. So `sprint_id` FK references `sprints(id)` which doesn't exist. Two options:
- **A. Omit the FK constraint in Plan 3** (just `sprint_id uuid` with no `references`). Plan 4 (sprints) adds the FK via `ALTER TABLE`.
- **B. Create a stub `sprints` table in Plan 3** just to satisfy the FK. Empty table.

**Decision: A.** Defer the FK to Plan 4. Comment in the migration explains it.

## Identifier allocation

Atomic via Supabase RPC `create_issue_with_identifier(p_project_id uuid, p_workspace_id uuid, p_title text, p_description text, p_reporter_id uuid)` that:
1. Locks the `projects` row for update.
2. Reads + increments `next_issue_number`.
3. Computes `identifier = key || '-' || next_issue_number` (where `key` is read from the locked `projects` row).
4. INSERTs the issue with that identifier.
5. Returns the inserted issue row.

This is one DB round-trip, atomic, no race condition. Service layer calls `supabase.rpc("create_issue_with_identifier", {...})` and parses the response into `IssueResponse`.

**Alternative considered:** Doing the two SQL statements in the service layer with Python-side transaction. Rejected because supabase-py doesn't expose explicit BEGIN/COMMIT cleanly. RPC is the supabase-native way.

## RLS

Same defense-in-depth pattern as Plan 2:
- SELECT: `is_workspace_member(workspace_id)` ✓
- INSERT: `is_workspace_member(workspace_id)` with check ✓ — service still validates membership before calling RPC
- UPDATE: `is_workspace_member(workspace_id)` (both USING and WITH CHECK to prevent stealing the issue to another workspace)
- DELETE: `is_workspace_member(workspace_id)`

Service layer is the authoritative gate (as in Plan 2). RPC function runs as `security definer` so it can write past RLS — but the service layer checks membership before calling it.

## API contract

**POST /projects/{p_id}/issues**
- Request body: `{ title: str (1-200), description?: str (0-10000), priority?: issue_priority, status?: issue_status, due_date?: date, assignee_id?: uuid }`
- Service: checks caller is workspace member of the project's workspace, then calls RPC.
- Response 201: `IssueResponse` (includes auto-assigned `identifier`).
- Errors: 403 if not member, 404 if project not found.

**GET /projects/{p_id}/issues?status=**
- Service: checks membership, queries `issues` filtered by `project_id` (and optional `status`), ordered by `created_at` desc, limit 200 (paging deferred).
- Response 200: `list[IssueResponse]`.

**GET /issues/{i_id}**
- Service: fetch issue, check caller is member of its workspace, return.
- Response 200: `IssueResponse`.
- Errors: 403 / 404.

**PATCH /issues/{i_id}**
- Body: any subset of `{ title, description, status, priority, assignee_id, due_date }`. `identifier`, `project_id`, `workspace_id`, `reporter_id` are immutable.
- Service: fetch+membership+update.
- Response 200: updated `IssueResponse`.

**DELETE /issues/{i_id}**
- Service: fetch+membership+delete.
- Response 204.

## Frontend

### Routes (added to App.tsx under `/w/:wsSlug` workspace layout)
```tsx
<Route path="/w/:wsSlug" element={<WorkspaceLayout/>}>
  <Route index element={<WorkspaceHome/>}/>
  <Route path="p/:pKey/list" element={<IssueList/>}/>
  <Route path="p/:pKey/issues/:identifier" element={<IssueDetail/>}/>
</Route>
```
Project card click in `WorkspaceHome` → `navigate(/w/${wsSlug}/p/${p.key}/list)`.

### `IssueList` page
- Header: project name + key, "New issue" button.
- Toolbar: status filter dropdown (all/backlog/todo/in_progress/in_review/done/cancelled).
- Table:
  | identifier | title | status | priority | created |
  |---|---|---|---|---|
  | BE-1 | "Set up auth" | todo | high | 2026-05-15 |
- Each row is clickable → navigate to detail.
- "New issue" → inline form (collapsible Card, same shape as Plan 2's project form): title required, description optional, priority/status default to backlog/no_priority. On submit → `useCreateIssue` → invalidate list → toast.

### `IssueDetail` page
- Header: identifier + title (title is contenteditable on click, blur to save).
- Sidebar (right): status pill (click → dropdown to change), priority pill (same), due_date (date input), reporter email, created_at.
- Body: description textarea (edit-in-place, save on blur).
- Delete button (with confirm dialog).
- Implementation: `useIssue(...)` for read, `useUpdateIssue` for each field change. No batching — each blur fires a PATCH with just that field.

### Lookup by identifier
`IssueDetail` receives `identifier` from URL. It calls `useIssues(projectId)` and finds the matching issue. Cleaner than a separate by-identifier endpoint at this stage. If list is paginated later, switch to a dedicated endpoint.

## Testing

- Backend pytest: service-layer mocks (similar pattern to Plan 2). Tests for: create happy path (mocked RPC), create non-member 403, list with/without filter, get member-only, patch immutable fields are dropped, delete cascade not applied (sub-issues null), atomic identifier (RPC behavior tested via integration test? Or skip and trust the RPC's SQL).
- Frontend: tsc clean.
- Playwright E2E: extend `workspace.spec.ts` with one more test: after creating workspace + project, create an issue "Test issue", verify it appears in list, click → detail page renders, change status to "todo", reload list, confirm status updated. Same shared-context pattern from Plan 2's E2E fix.

## File structure (new/modified)

```
backend/
  app/
    schemas/issue.py                          # NEW
    services/issues.py                        # NEW
    routers/issues.py                         # NEW
    main.py                                   # MOD: mount issues router
  tests/
    test_issues_service.py                    # NEW
    test_issues_router.py                     # NEW

supabase/
  migrations/
    20260516000000_issues.sql                 # NEW (table + enums + RLS + RPC function)

frontend/
  src/
    features/issues/api.ts                    # NEW (hooks)
    pages/IssueList.tsx                       # NEW
    pages/IssueDetail.tsx                     # NEW
    pages/WorkspaceHome.tsx                   # MOD: project card → /list
    App.tsx                                   # MOD: add issues routes
  tests/
    workspace.spec.ts                         # MOD: extend with issue E2E
```

## Open decisions deliberately taken

1. **Identifier in URL uses the full `BE-1` form**, not just `1`. Matches spec "Cross-project references use the full identifier."
2. **No optimistic updates in Plan 3** — Plan 7+ will retrofit them. Better to ship the boring slow version first and feel the latency before optimizing.
3. **No `IssueResponse.assignee_email` / joined fields.** Plan 3 returns `assignee_id` (uuid or null). Detail UI shows the UUID for assigned issues; assignee email lookup deferred until member picker UI exists.
4. **Description is plain text in Plan 3.** Saved as `text`, rendered in a `<textarea>` for edit and `<pre class="whitespace-pre-wrap">` for read. Markdown rendering is Plan 4+ territory.

## What this unblocks for later plans

- Plan 4 (Sprints): adds `sprints` table, adds the deferred FK on `issues.sprint_id`, adds sprint pickers.
- Plan 5 (Comments): adds `comments` table + endpoints, adds Comment section under `IssueDetail`.
- Plan 6 (Labels): adds `labels`, `issue_labels`, label picker.
- Plan 7 (Kanban): adds Board view using `position` column.
- Plan 8 (Activity/Notifications): adds `activity_log`, `notifications`, realtime hooks.
- Plan 9 (Cmd+K): adds palette, uses `/issues/by-identifier` endpoint.

## Open question to verify before writing the plan

Is `auth.users(id)` referenceable from migration files in Supabase Local? Plan 2 referenced `auth.users(id)` successfully in the workspaces/projects migration, so yes. Confirmed.
