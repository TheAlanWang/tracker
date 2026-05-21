-- ─── Goals + Checklist + Sub-task removal ───
-- Replaces the sub-task feature with two cleaner concepts:
--   1. Goals — workspace-scoped, recursive hierarchy. The "why" layer.
--      A task can be linked to at most one goal via tasks.goal_id.
--   2. task_checklist_items — lightweight TODO bullets inside a task's
--      detail page. Not independent tasks; no identifier, no status,
--      not in any list view. Pure note-taking.
--
-- The sub-task RPC create_subtask_with_identifier is dropped. The
-- tasks.parent_id column stays (cheap, FK'd, no UI surface).

-- ─── goals table ───
create table goals (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  parent_goal_id uuid references goals(id) on delete cascade,
  title text not null check (length(title) > 0 and length(title) <= 200),
  description text not null default '',
  status text not null default 'active'
    check (status in ('active', 'achieved', 'paused', 'dropped')),
  position float not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index goals_workspace_id_idx on goals (workspace_id);
create index goals_parent_idx on goals (parent_goal_id);

alter table goals enable row level security;

create policy "members can read workspace goals"
  on goals for select
  using (is_workspace_member(workspace_id));

create policy "members can insert workspace goals"
  on goals for insert
  with check (is_workspace_member(workspace_id));

create policy "members can update workspace goals"
  on goals for update
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

create policy "members can delete workspace goals"
  on goals for delete
  using (is_workspace_member(workspace_id));

-- updated_at trigger (reuse the helper from earlier migrations)
create trigger goals_set_updated_at
  before update on goals
  for each row execute function set_updated_at();

-- ─── tasks.goal_id ───
alter table tasks add column goal_id uuid references goals(id) on delete set null;
create index tasks_goal_id_idx on tasks (goal_id);

-- ─── task_checklist_items table ───
create table task_checklist_items (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid not null references tasks(id) on delete cascade,
  text text not null check (length(text) > 0 and length(text) <= 200),
  done boolean not null default false,
  position float not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index task_checklist_items_task_id_idx on task_checklist_items (task_id);

alter table task_checklist_items enable row level security;

-- Membership derived through the parent task's workspace_id. Wrapped in
-- a SELECT so the policy evaluates the join lazily per-row.
create policy "members can read task checklist"
  on task_checklist_items for select
  using (is_workspace_member((select workspace_id from tasks where id = task_id)));

create policy "members can insert task checklist"
  on task_checklist_items for insert
  with check (is_workspace_member((select workspace_id from tasks where id = task_id)));

create policy "members can update task checklist"
  on task_checklist_items for update
  using (is_workspace_member((select workspace_id from tasks where id = task_id)))
  with check (is_workspace_member((select workspace_id from tasks where id = task_id)));

create policy "members can delete task checklist"
  on task_checklist_items for delete
  using (is_workspace_member((select workspace_id from tasks where id = task_id)));

create trigger task_checklist_items_set_updated_at
  before update on task_checklist_items
  for each row execute function set_updated_at();

-- ─── Sub-task cleanup ───
-- Drop the RPC introduced by 20260601000000_create_subtask.sql. The
-- tasks.parent_id column stays — dropping it would be destructive and the
-- column is harmless once nothing reads it.
drop function if exists create_subtask_with_identifier(
  uuid, text, text, task_priority, uuid, date, uuid
);
