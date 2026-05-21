-- ─── task_dependencies ───
-- Directed "A blocks B" relationships between tasks. Each row says
-- `blocker_task_id` must be done (or at least progressed) before
-- `blocked_task_id` can proceed. The inverse direction ("A is blocked
-- by B") is just the same row read from the other side.
--
-- Constraints:
--   - No self-blocks      → check (blocker <> blocked)
--   - No duplicate pairs  → unique (blocker, blocked)
--   - Both ends cascade-delete if a task is removed
--
-- Cycle prevention (A→B→A) is enforced in the service layer rather than
-- a SQL trigger — small graphs, app-level check is simpler and produces
-- a friendly HTTP error rather than a stack trace.

create table task_dependencies (
  id uuid primary key default uuid_generate_v4(),
  blocker_task_id uuid not null references tasks(id) on delete cascade,
  blocked_task_id uuid not null references tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint task_dependencies_no_self check (blocker_task_id <> blocked_task_id),
  constraint task_dependencies_unique_pair unique (blocker_task_id, blocked_task_id)
);

-- Both indexes serve common queries: "who blocks task X" and "what does
-- task X block". Postgres uses unique(blocker, blocked) for the first
-- direction, but adding the explicit index on `blocked_task_id` covers
-- the second.
create index task_dependencies_blocked_idx on task_dependencies (blocked_task_id);

alter table task_dependencies enable row level security;

-- Membership is derived through either task's workspace. Either side
-- works because the service layer enforces that both tasks live in the
-- same workspace at write time.
create policy "members can read task deps"
  on task_dependencies for select
  using (
    is_workspace_member(
      (select workspace_id from tasks where id = blocker_task_id)
    )
  );

create policy "members can insert task deps"
  on task_dependencies for insert
  with check (
    is_workspace_member(
      (select workspace_id from tasks where id = blocker_task_id)
    )
  );

create policy "members can delete task deps"
  on task_dependencies for delete
  using (
    is_workspace_member(
      (select workspace_id from tasks where id = blocker_task_id)
    )
  );
