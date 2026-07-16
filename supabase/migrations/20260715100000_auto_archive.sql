-- Auto-archive: done/cancelled tasks move to the Archive after a
-- per-project number of days (spec: docs/superpowers/specs/
-- 2026-07-15-auto-archive-design.md).
--
-- Pieces:
--   1. projects.auto_archive_days — 'off' | '7' | '14' | '30', default '30'.
--   2. tasks.completed_at — stamped by a BEFORE trigger when a task enters
--      done/cancelled, cleared when it leaves. DB-level because status
--      changes arrive via task PATCH, board moves, and the sprint-completion
--      RPC alike.
--   3. Backfill for existing terminal tasks from activity_log (both payload
--      shapes: consolidated 'updated' rows and legacy 'status_changed').
--   4. archive_stale_tasks() — the lazy sweep, called by the backend before
--      task-list reads. The existing tasks_log_changes AFTER trigger records
--      the archived_at flip with actor_id NULL (activity_log.actor_id is
--      already nullable) — rendered as "System" in the UI.

-- 1. Per-project setting -----------------------------------------------

alter table public.projects
  add column auto_archive_days text not null default '30'
    check (auto_archive_days in ('off', '7', '14', '30'));

comment on column public.projects.auto_archive_days is
  'Days after which done/cancelled tasks are auto-archived. '
  'One of: off, 7, 14, 30. Defaults to 30.';

-- 2. completed_at + trigger --------------------------------------------

alter table public.tasks
  add column completed_at timestamptz;

comment on column public.tasks.completed_at is
  'When the task entered done/cancelled (or was last restored from the '
  'archive while still terminal — restore resets the auto-archive clock). '
  'NULL for non-terminal tasks. Not a pure completion timestamp: use '
  'activity_log for cycle-time analytics.';

create or replace function set_task_completed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- Board column "+ Add" can create a task directly in done.
    if new.status in ('done', 'cancelled') then
      new.completed_at := now();
    end if;
    return new;
  end if;
  if new.status in ('done', 'cancelled')
     and old.status not in ('done', 'cancelled') then
    new.completed_at := now();
  elsif new.status not in ('done', 'cancelled')
     and old.status in ('done', 'cancelled') then
    new.completed_at := null;
  end if;
  -- done <-> cancelled keeps the original stamp.
  return new;
end;
$$;

create trigger tasks_set_completed_at
  before insert or update on public.tasks
  for each row execute function set_task_completed_at();

-- 3. Backfill existing terminal tasks ----------------------------------
-- Latest event that put the task into its CURRENT status; tasks with no
-- matching event (created before the log, or created directly as done)
-- fall back to updated_at.

update public.tasks t
set completed_at = coalesce(
  (
    select al.created_at
    from public.activity_log al
    where al.task_id = t.id
      and (
        (al.action = 'updated'
          and al.payload -> 'status' ->> 'to' = t.status::text)
        or
        (al.action = 'status_changed'
          and al.payload ->> 'to' = t.status::text)
      )
    order by al.created_at desc
    limit 1
  ),
  t.updated_at
)
where t.status in ('done', 'cancelled')
  and t.completed_at is null;

-- 4. Lazy sweep function ------------------------------------------------
-- Called by the backend (service role) before task-list reads. Both params
-- nullable: project list passes p_project_id, workspace list passes
-- p_workspace_id. Each project's own setting applies via the join.

create or replace function archive_stale_tasks(
  p_project_id uuid default null,
  p_workspace_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  -- The backend forwards the viewer's JWT, so auth.uid() inside the
  -- tasks_log_changes trigger would attribute the sweep's archived_at
  -- flip to whoever happened to load the list. Clear the JWT claims for
  -- this transaction only (set_config(..., true)) so the activity rows
  -- get actor_id NULL — rendered as "System" in the UI.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);

  update tasks t
  set archived_at = now()
  from projects p
  where p.id = t.project_id
    and (p_project_id is null or t.project_id = p_project_id)
    and (p_workspace_id is null or p.workspace_id = p_workspace_id)
    and p.auto_archive_days <> 'off'
    and t.status in ('done', 'cancelled')
    and t.archived_at is null
    and t.completed_at is not null
    and t.completed_at < now() - case
      when p.auto_archive_days = 'off' then null
      else make_interval(days => p.auto_archive_days::int)
    end;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Backend calls this with the service key; browsers have no business here.
revoke execute on function archive_stale_tasks(uuid, uuid) from public, anon, authenticated;
