# Tracker — Design Spec

**Date:** 2026-05-14
**Codename:** tracker
**Status:** Approved (pending user final review)

A Linear-style task tracker for personal use and small teams, built local-first with a clear path to cloud deployment.

---

## 1. Goals & Non-Goals

### Goals
- A modern, keyboard-driven task tracker for personal use or small teams (≤ 10 members).
- Showcase quality: enough features and polish that the project stands on its own as a portfolio piece.
- Architecture is "local-first dev, cloud-ready prod": runs locally with `make dev`, but no code assumes single-machine state.
- Strong design discipline: features fewer but more polished, rather than many shallow.

### Non-Goals (explicitly out of scope for MVP)
- Gantt chart, burndown/velocity reports, OKR tracking.
- Webhook/third-party integrations (GitHub, Slack, etc.).
- Custom workflows, custom fields, custom issue types.
- RBAC beyond `owner / admin / member`.
- Email notifications.
- File attachments.
- Multi-language UI.
- Mobile-native app (the web app should be responsive; no native build).

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Vite + React 18 + TypeScript** | Light, fast, no SSR overhead since backend is separate. |
| UI | **Tailwind CSS + shadcn/ui** | Copy-paste components, no black-box UI library. |
| Frontend state | **React Query (server state) + Zustand (UI state)** | Right tool for each kind of state. |
| Routing | **React Router v6** | Standard. |
| Backend | **FastAPI (Python 3.12)** | User already proficient; great for typed REST APIs. |
| DB + Auth + Realtime | **Supabase (Postgres 15)** | RLS for data isolation; Realtime via Postgres logical replication; Auth handled by Supabase. |
| Dev DB | **Supabase Local CLI (Docker)** | Migrations, RLS, seeds testable locally. |
| Prod DB | **Supabase Cloud** | Same stack, configurable via env. |
| Type sync | **`openapi-typescript`** generates TS types from FastAPI OpenAPI schema. | Single source of truth. |
| Testing (be) | **pytest + httpx** | Standard. |
| Testing (fe) | **vitest + React Testing Library** | Standard. |
| E2E | **Playwright** | For golden-path coverage only. |
| Package manager | **pnpm** (web) + **uv** (api) | Fast, modern. |
| CI | **Postponed to v0.2** | Local tests only in MVP. |

---

## 3. Repo Layout

Single git repo, two apps, three top-level dirs.

```
tracker/
├── apps/
│   ├── web/                          # Vite + React frontend
│   │   ├── src/
│   │   │   ├── api/                  # axios client + openapi-typescript output
│   │   │   ├── components/
│   │   │   │   ├── ui/               # shadcn/ui components
│   │   │   │   └── shared/           # cross-feature business components
│   │   │   ├── features/             # vertical-sliced by business domain
│   │   │   │   ├── issues/
│   │   │   │   ├── sprints/
│   │   │   │   ├── workspaces/
│   │   │   │   ├── auth/
│   │   │   │   └── command-palette/
│   │   │   ├── hooks/                # useShortcuts, useOptimisticUpdate, ...
│   │   │   ├── lib/                  # utils, supabase client (auth only)
│   │   │   ├── pages/                # route components
│   │   │   ├── stores/               # Zustand stores
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   └── package.json
│   └── api/                          # FastAPI backend
│       ├── app/
│       │   ├── routers/              # HTTP routes, thin
│       │   ├── schemas/              # Pydantic request/response models
│       │   ├── services/             # business logic, testable in isolation
│       │   ├── db/
│       │   │   └── supabase.py       # supabase-py client wrapper
│       │   ├── core/
│       │   │   ├── config.py         # env vars
│       │   │   ├── deps.py           # FastAPI dependencies (auth, db)
│       │   │   └── security.py       # JWT verification against Supabase
│       │   └── main.py
│       ├── tests/
│       └── pyproject.toml
├── supabase/
│   ├── migrations/                   # SQL migrations (CLI-managed)
│   ├── seed.sql                      # dev seed
│   ├── seed_test.sql                 # test fixtures
│   └── config.toml                   # supabase CLI config
├── docs/
│   └── superpowers/specs/
│       └── 2026-05-14-tracker-design.md   # this file
├── .gitignore
├── .env.example
├── docker-compose.yml                # local supabase stack
├── Makefile                          # make dev / test / migrate / seed
└── README.md
```

### Architecture Rationale
- **`features/` vertical slicing** instead of horizontal (`components/`, `hooks/`, `pages/` flat). Easier to locate code and delete features cleanly.
- **`routers / schemas / services` separation in backend** keeps HTTP concerns, contract, and business logic decoupled, so services are unit-testable without booting FastAPI.
- **Single repo, two apps**: simpler than three repos for one maintainer; OpenAPI auto-syncs types so a `packages/types` layer isn't needed.

---

## 4. Feature Scope (MVP)

### Included
1. **Issue CRUD** with fields: title, description (markdown), status, priority, assignee, due_date, labels.
2. **Workspaces** — multi-workspace; each user belongs to one or more.
3. **Projects** — multiple per workspace, each with its own sprints.
4. **Kanban view** — drag-and-drop to change status, with optimistic UI.
5. **List view** — sortable + filterable.
6. **Auth** — email/password + Google OAuth via Supabase Auth.
7. **Comments** — basic markdown body, edit/delete by author.
8. **Sprints** (Cycles) — start/end dates, status machine, complete with auto-rollover.
9. **Sub-issues** — parent-child via `issues.parent_id`.
10. **Issue relations** — `blocks`, `relates_to`, `duplicates` via `issue_relations` table.
11. **Activity log** — append-only per issue.
12. **In-app notifications** with red dot + toast.
13. **Markdown description** — rendered with `react-markdown` + DOMPurify, no raw HTML allowed.
14. **Cmd+K command palette** — search issues by identifier or title; quick actions; jump to project/inbox.
15. **Keyboard shortcuts** — `C` create issue, `E` edit, `Esc` close, `G I` go to inbox, etc.
16. **Optimistic updates** — kanban drag, status change, comment post.
17. **Realtime** via Supabase Realtime:
    - Notifications (instant red dot + toast)
    - Issues on currently-viewed kanban (instant team sync)
18. **Personal Dashboard** (`/dashboard`) — cross-workspace "Your Work" page: assigned to me, active sprints across workspaces, items due this week.
19. **Profile settings** (`/settings/profile`) — display name, avatar, email change (re-verification required).
20. **Issue short-link** (`/browse/:identifier`) — direct-access URL for any issue; backend resolves identifier → workspace+project → redirects to canonical issue URL.
21. **Backlog / Sprint Planning view** (`/p/:projKey/backlog`) — two-column layout: planned sprint on the left, backlog on the right; drag issues between columns; "Start sprint" button activates the planned sprint.

---

## 5. Data Model

### Entity overview

```
auth.users  ──┐
              │ owner / member
              ▼
        workspaces
              │
       ┌──────┼──────┐
       ▼      ▼      ▼
   members  labels  projects
                       │
                ┌──────┼──────┐
                ▼      ▼      ▼
             sprints  issues  (issues live under project)
                       │
       ┌─────┬─────┬───┴────┬─────────┐
       ▼     ▼     ▼        ▼         ▼
   comments  rel.  activity  labels   notif.
              (issue_relations, issue_labels)
```

### Tables

#### `workspaces`
| col | type | notes |
|---|---|---|
| `id` | uuid | pk |
| `name` | text | |
| `slug` | text | unique, url-safe |
| `owner_id` | uuid → auth.users | |
| `created_at`, `updated_at` | timestamptz | |

#### `workspace_members`
| col | type | notes |
|---|---|---|
| `workspace_id` | uuid → workspaces | pk pt1 |
| `user_id` | uuid → auth.users | pk pt2 |
| `role` | enum: `owner` / `admin` / `member` | |
| `created_at` | timestamptz | |

#### `projects`
| col | type | notes |
|---|---|---|
| `id` | uuid | pk |
| `workspace_id` | uuid → workspaces | |
| `name` | text | |
| `key` | text | "FE", "API" — unique within workspace; used in issue identifier |
| `next_issue_number` | int | per-project counter for identifier (starts at 1) |
| `description` | text | nullable |
| `created_at`, `updated_at` | timestamptz | |

#### `sprints`
| col | type | notes |
|---|---|---|
| `id` | uuid | pk |
| `project_id` | uuid → projects | |
| `name` | text | "Sprint 5" |
| `start_at` | timestamptz | |
| `end_at` | timestamptz | dates may overlap with other sprints |
| `status` | enum: `planned` / `active` / `completed` | |
| `created_at`, `updated_at` | timestamptz | |

**Constraint:** `CREATE UNIQUE INDEX one_active_sprint_per_project ON sprints (project_id) WHERE status = 'active';`

#### `issues`
| col | type | notes |
|---|---|---|
| `id` | uuid | pk |
| `workspace_id` | uuid → workspaces | denormalized for RLS efficiency |
| `project_id` | uuid → projects | |
| `sprint_id` | uuid → sprints | nullable (backlog) |
| `parent_id` | uuid → issues | nullable (sub-issue) |
| `identifier` | text | "FE-12" — unique within project (`project.key` + "-" + sequence) |
| `title` | text | |
| `description` | text | markdown |
| `status` | enum: `backlog` / `todo` / `in_progress` / `in_review` / `done` / `cancelled` | |
| `priority` | enum: `no_priority` / `urgent` / `high` / `medium` / `low` | |
| `assignee_id` | uuid → auth.users | nullable |
| `reporter_id` | uuid → auth.users | |
| `due_date` | date | nullable |
| `position` | double precision | fractional indexing for kanban order |
| `created_at`, `updated_at` | timestamptz | |

#### `comments`
| col | type | notes |
|---|---|---|
| `id` | uuid | pk |
| `issue_id` | uuid → issues | |
| `author_id` | uuid → auth.users | |
| `body` | text | markdown |
| `created_at`, `updated_at` | timestamptz | |

#### `labels`
| col | type | notes |
|---|---|---|
| `id` | uuid | pk |
| `workspace_id` | uuid → workspaces | |
| `name` | text | |
| `color` | text | hex |

#### `issue_labels` (join table)
| col | type |
|---|---|
| `issue_id` | uuid → issues, pk pt1 |
| `label_id` | uuid → labels, pk pt2 |

#### `issue_relations`
| col | type | notes |
|---|---|---|
| `id` | uuid | pk |
| `from_issue_id` | uuid → issues | |
| `to_issue_id` | uuid → issues | |
| `type` | enum: `blocks` / `relates_to` / `duplicates` | |
| `created_at` | timestamptz | |
| `created_by` | uuid → auth.users | |

#### `activity_log`
| col | type | notes |
|---|---|---|
| `id` | uuid | pk |
| `issue_id` | uuid → issues | |
| `actor_id` | uuid → auth.users | |
| `action` | text | "status_changed" / "assignee_changed" / "commented" / "sprint_rolled_over" / ... |
| `payload` | jsonb | shape varies by action |
| `created_at` | timestamptz | |

#### `notifications`
| col | type | notes |
|---|---|---|
| `id` | uuid | pk |
| `user_id` | uuid → auth.users | recipient |
| `type` | enum: `assigned` / `mentioned` / `commented` / `status_changed` | |
| `issue_id` | uuid → issues | |
| `actor_id` | uuid → auth.users | who triggered it |
| `payload` | jsonb | |
| `read_at` | timestamptz | nullable; null = unread |
| `created_at` | timestamptz | |

### Identifier allocation
- Each project owns a counter (`projects.next_issue_number`).
- Issue creation: `UPDATE projects SET next_issue_number = next_issue_number + 1 WHERE id = ? RETURNING next_issue_number` in the same transaction as the `INSERT INTO issues`.
- Identifier = `${project.key}-${number}`. Example: project key `BE` + counter 32 → `BE-32`.
- Cross-project references use the full identifier. Within a single project, the UI may display the number alone (e.g., `#32`).

### Cascade rules
- Delete `workspace` → cascade `projects`, `members`, `labels`, `notifications`.
- Delete `project` → cascade `sprints`, `issues`.
- Delete `issue`:
  - User-facing modal prompts: cascade sub-issues, or promote them to top-level.
  - `comments`, `activity_log`, `issue_relations`, `issue_labels`, `notifications` are always cascaded.
- Delete `auth.users` → `issues.assignee_id`, `issues.reporter_id`, `comments.author_id` set to NULL (preserve history).

### RLS policies (essential)
All tables enable RLS. Reading and writing follow workspace membership:

```sql
-- example for issues table
create policy "members read workspace issues"
  on issues for select
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

create policy "members write workspace issues"
  on issues for insert with check (...same predicate...);
```

This means even if FastAPI forgets a permission check, the DB will not return rows the user shouldn't see — and Supabase Realtime will respect the same policies.

---

## 6. API Surface

REST over HTTPS, all endpoints behind `Authorization: Bearer <supabase_jwt>` except `/health`.

### Auth & Profile
- `GET /me` — current user + workspaces.
- `PATCH /me/profile` — update display name, avatar URL.
- `PATCH /me/email` — change email (sends Supabase verification email).
- `GET /me/dashboard` — aggregated cross-workspace data: `{ assigned_to_me: [...], active_sprints: [...], due_this_week: [...] }`. Limits each list to 20.
- `GET /resolve/identifier/{identifier}` — resolves "BE-32" → `{ workspace_slug, project_key, issue_id }`. Used by `/browse/:identifier` to know where to redirect.
- Signup/login are handled directly by Supabase JS SDK on the frontend.

### Workspaces
- `GET/POST /workspaces`
- `GET/PATCH/DELETE /workspaces/{ws_id}`
- `GET/POST /workspaces/{ws_id}/members`
- `PATCH/DELETE /workspaces/{ws_id}/members/{user_id}`

### Projects
- `GET/POST /workspaces/{ws_id}/projects`
- `GET/PATCH/DELETE /projects/{p_id}`

### Sprints
- `GET/POST /projects/{p_id}/sprints`
- `GET/PATCH/DELETE /sprints/{s_id}`
- `POST /sprints/{s_id}/start` — planned → active. Only one active sprint per project (enforced by unique index).
- `POST /sprints/{s_id}/complete` — active → completed. Auto-rollover behavior:
  - "Unfinished" = issues with `status NOT IN ('done', 'cancelled')`.
  - If a `planned` sprint exists in the project (earliest by `start_at`), move all unfinished issues there.
  - Otherwise, set their `sprint_id` to NULL (back to backlog).
  - Response: `{ completed, rolled_over_to: <sprint_id or null>, count }`.

### Issues
- `GET /projects/{p_id}/issues?status=&assignee=&sprint_id=&label=&parent_id=`
- `POST /projects/{p_id}/issues`
- `GET /issues/{i_id}` — includes comments, activity, relations.
- `GET /issues/by-identifier/{identifier}` — for Cmd+K direct jump.
- `PATCH /issues/{i_id}` — edit fields.
- `POST /issues/{i_id}/move` — atomic `(status, position)` update for drag-and-drop.
- `DELETE /issues/{i_id}?cascade=children|none` — `children` deletes sub-issue subtree; `none` (default) promotes them.
- `GET /issues/{i_id}/activity`

### Comments / Labels / Relations
- `GET/POST /issues/{i_id}/comments`, `PATCH/DELETE /comments/{c_id}`
- `GET/POST /workspaces/{ws_id}/labels`, `POST/DELETE /issues/{i_id}/labels/{l_id}`
- `POST /issues/{i_id}/relations`, `DELETE /relations/{r_id}`

### Notifications
- `GET /me/notifications`
- `POST /me/notifications/read-all`
- `POST /notifications/{n_id}/read`

### Search
- `GET /search?q=&ws_id=` — cross-resource search; LIMIT 20.

### Error response shape
```json
{
  "detail": "Cannot transition cancelled → in_progress",
  "code": "ISSUE_INVALID_TRANSITION",
  "fields": { "status": "..." }
}
```

---

## 7. Frontend Architecture

### Routing tree (Jira-style: two scopes — personal and workspace)

```
─── Personal scope (cross-workspace) ─────────────────────────
/                              redirect to last visited workspace, or /dashboard if none
/login                         Supabase Auth UI
/auth/callback                 OAuth landing
/dashboard                     "Your Work" — cross-workspace personal home
/settings/profile              personal settings (name, avatar, email)
/browse/:identifier            issue short-link, resolves and redirects to /w/.../issues/:identifier
/w                             workspace picker (list of my workspaces)
/onboarding                    first-time user creates first workspace

─── Workspace scope ──────────────────────────────────────────
/w/:wsSlug                     workspace home = projects list
/w/:wsSlug/inbox               notifications (this workspace)
/w/:wsSlug/my-issues           assigned/reported in this workspace
/w/:wsSlug/search              workspace-scoped search results
/w/:wsSlug/settings            workspace settings (members, labels)

─── Project scope ────────────────────────────────────────────
/w/:wsSlug/p/:projectKey       project home → redirect /board
  /board                       kanban (active sprint by default)
  /backlog                     sprint planning view (two-column)
  /list                        list view (sortable + filterable)
  /sprints                     sprint list
  /sprints/:sprintId           single sprint view
  /issues/:identifier          issue detail (canonical URL)
  /settings                    project settings
```

### Layouts (two distinct chromes)

**Personal layout** (used by `/dashboard`, `/settings/profile`, `/w`, `/onboarding`)
- Left sidebar shows personal nav: Dashboard, Profile, Workspace switcher.
- Header is minimal: just user avatar + sign out.

**Workspace layout** (used by all `/w/:wsSlug/*` and `/w/:wsSlug/p/:projectKey/*`)
- Left sidebar: workspace switcher (top), Inbox, My Issues, Projects list, Active Sprints, User menu.
- Project context (when inside a project): secondary sidebar item shows current project + child links (Board, Backlog, Sprints, List, Settings).
- Cmd+K palette is a global overlay, mounted at the App root regardless of layout.

### State management map
| Kind | Tool | Examples |
|---|---|---|
| Server data | React Query | issue lists, comments, current user |
| UI state | Zustand | Cmd+K open, sidebar collapsed |
| Route state | React Router | current workspace/project |
| Form state | React Hook Form | issue create/edit |

### Optimistic updates
React Query `useMutation` with `onMutate` snapshot + `onError` rollback. Applied to: kanban drag (status + position), single-field issue edits, comment posting.

### Realtime integration
- One channel per subscription target:
  - `notifications:user_id=<me>` → updates the notification cache + shows toast.
  - `issues:project_id=<current>` → invalidates the kanban query (lightweight: refetch the affected issue).
- Subscriptions live in feature-scoped hooks (`useNotificationsRealtime`, `useKanbanRealtime`), mounted via `useEffect`.
- Self-echo handling: compare `updated_at` to local cache; ignore if local is newer or equal.

### Cmd+K
- Built on the [`cmdk`](https://github.com/pacocoursey/cmdk) library.
- Sources: search API (debounced 200ms), recent items (localStorage), static action list.
- Triggers globally via `useShortcuts` (Cmd+K / Ctrl+K).

### Keyboard shortcuts
- `C` — create issue (any page within a project)
- `E` — edit current issue (on detail page)
- `Esc` — close modal/palette
- `G then I` — go to inbox
- `G then M` — go to my issues
- `J / K` — navigate list (lists & kanban columns)

Registered through a single `useShortcuts(map)` hook, mounted per-page. The hook handles modifier composition and disables shortcuts while typing in inputs.

---

## 8. Key Interactions

### Kanban drag (optimistic)
1. `onDrop` → `useMoveIssue.mutate({ id, status, position })`.
2. `onMutate` cancels related queries, snapshots prev cache, writes new `(status, position)` into cache.
3. UI updates instantly.
4. `POST /issues/{i_id}/move` runs server-side in a transaction: update issue, append activity row, create notifications for watchers.
5. On success: invalidate kanban query to reconcile.
6. On error: rollback cache from snapshot, show toast.

### Sprint complete
1. User confirms in modal showing unfinished count.
2. `POST /sprints/{s_id}/complete` runs in a single transaction:
   - Look up earliest `planned` sprint in same project.
   - Update all unfinished issues' `sprint_id` (target sprint id or NULL).
   - Append `sprint_rolled_over` activity row per moved issue.
   - Mark sprint `completed`.
3. Response includes `rolled_over_to` and `count`.
4. Frontend toast: "Sprint #5 完成, 7 个未完成已转到 Sprint #6" or "退回 backlog".

### Cmd+K search
1. Open palette → focus input.
2. Debounce 200ms → `GET /search?q=...&ws_id=...`.
3. Render results from API + recent items + static actions.
4. Arrow keys navigate, Enter activates: navigate to issue page / run action / close palette.

### Backlog / Sprint Planning
1. User opens `/w/:ws/p/:proj/backlog`.
2. Left column = first `planned` sprint in this project (or empty placeholder); right column = backlog issues (`sprint_id IS NULL`).
3. Dragging an issue between columns calls `PATCH /issues/{i_id}` with `sprint_id` change. Position within column uses fractional indexing same as kanban.
4. "Start sprint" button on the planned column → `POST /sprints/{s_id}/start`. On success, page navigates to `/board` (now showing the just-started sprint).
5. If no planned sprint exists, the left column shows a "Create sprint" CTA.

### Browse short-link
1. User opens `/browse/BE-32` (e.g., from a Slack message or external doc).
2. Frontend hits `GET /resolve/identifier/BE-32`.
3. Backend looks up `issues` table (filter by identifier + user's accessible workspaces via RLS), returns `{ workspace_slug, project_key, issue_id }`.
4. Frontend redirects to `/w/<ws_slug>/p/<project_key>/issues/BE-32`.
5. If not found (typo, no permission, deleted), show "Issue not found" page.

### Auth flow
- Frontend uses Supabase JS SDK to sign in (email/password or Google OAuth).
- Receives `access_token` (1h) + `refresh_token` (30d).
- axios request interceptor attaches `Authorization`.
- axios response interceptor: on 401, refresh once and retry; on second 401, redirect to `/login`.
- Backend verifies JWT signature with Supabase public key (cached), extracts `sub` as user_id.
- **First-time user flow**: after sign-in, `GET /me` returns `workspaces: []`. Frontend routes the user to `/onboarding` where they create their first workspace (name only; project key is set when they later create a project). After workspace creation, redirect to `/w/:wsSlug`. Subsequent sign-ins land on the last-visited workspace stored in localStorage; if invalid, fall back to `/w`.

---

## 9. Error Handling & Edge Cases

### State machine
- Status transitions: enforced server-side. Disallowed: `cancelled → *`. All others permitted, including `done → todo` for "reopen".
- Sprint state: `planned → active → completed`. No reverse transitions.
- Only one `active` sprint per project (DB-level partial unique index).

### Concurrent edits
- Last-write-wins for issue field edits. Realtime ensures visibility.
- Identifier allocation atomic via `UPDATE ... RETURNING`.

### Permission edge cases
- User removed from workspace mid-session: next API call returns 403 → toast + redirect to `/w`.
- Owner cannot leave workspace until transferring ownership.
- Workspace deletion requires owner + typed confirmation.

### Markdown safety
- Render via `react-markdown` configured with `DOMPurify`. Raw HTML is disabled. No unsafe HTML injection APIs are used anywhere in the codebase.

### Realtime edge cases
- Self-echo: compare `updated_at`, ignore if local is current.
- Disconnect: Supabase SDK auto-reconnects; on reconnect, invalidate relevant queries to backfill missed events.
- Bursty INSERTs: debounce cache writes 50ms to avoid render thrash.

### Performance budget (MVP)
- Kanban renders up to ~200 issues without virtualization.
- Cmd+K results: 20-row cap.
- Fractional indexing: rebalance job manually triggered (not scheduled) when positions get too close.

---

## 10. Testing Strategy

### Pyramid
- **Backend unit (pytest, Supabase mocked)** — service layer covered.
- **Backend integration (pytest + httpx + Supabase Local)** — verifies auth, RLS, transactional behavior.
- **Frontend unit (vitest + RTL)** — hooks, key components.
- **E2E (Playwright)** — golden paths only.

### Must-have backend tests
- Status transition rules.
- Sprint complete with planned next → rollover.
- Sprint complete without planned → back to backlog.
- Unique active sprint constraint.
- Non-member cannot read workspace issues (RLS).
- Concurrent issue creation within the same project → unique identifiers.

### Must-have frontend tests
- Optimistic update rollback on mutation failure.
- Shortcut registration/unregistration on mount/unmount.
- Cmd+K debounce (one API call per debounce window).

### E2E golden paths
- Signup → create workspace → create issue → drag to in_progress → assert.
- Sprint full lifecycle: create → add issues → start → complete → assert rollover.
- Cmd+K from any page → search by identifier → land on issue.
- Two-browser realtime: A moves issue → B's kanban reflects within 1s.

### TDD scope (high-rigor)
- Sprint state machine + complete with rollover.
- Issue status transitions.
- Identifier allocation.
- RLS enforcement.

### Non-TDD
- UI components, layout, styling.
- Trivial CRUD pass-through endpoints.

---

## 11. Deployment Path

### MVP (local-only)
- `make dev` starts Supabase Local (Docker) + FastAPI (`uvicorn`) + Vite dev server.
- All three accessible at known localhost ports.
- Data persists in Docker volume.

### v0.2 — cloud staging
- Supabase Cloud project.
- FastAPI on Fly.io or Render.
- Frontend on Vercel or Netlify.
- GitHub Actions CI: lint + typecheck + unit + integration tests.

### Out of scope
- Custom domain, CDN, monitoring/observability — added when needed.

---

## 12. Open Questions (to revisit before implementation)

None blocking. Items deferred but worth tracking:
- Whether to add email notifications later (probably yes for v0.2).
- Whether to add a "watchers" relation table or derive watchers from comments + assignment.
- Whether `reopen` should be a separate endpoint or fall under generic PATCH (current spec: PATCH).

---

## 13. Out of Scope (v1.x roadmap)
- Gantt / timeline view
- Burndown / velocity charts
- File attachments
- Custom workflows, custom fields
- @mentions in comments + email notifications
- GitHub / Slack integrations
- Mobile apps
- Advanced RBAC
