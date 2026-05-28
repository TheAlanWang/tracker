-- ─── task archive ───
-- Per-task archive metadata. NULL = active, timestamp = archived at that
-- moment. Independent of `status`: a task can be (status: done,
-- archived_at: 2026-04-15) — status preserves intent, archived_at hides
-- the task from the default working surface.
alter table tasks
  add column archived_at timestamptz;

-- Partial index: every list query hits `archived_at is null` — let it
-- ride on a small dedicated index instead of scanning the full tasks
-- table. Archive view scans the (small) complement, no index needed.
create index tasks_active_idx on tasks (project_id, archived_at)
  where archived_at is null;

-- Activity-log integration: ride on the existing `updated` action +
-- JSONB payload diff that 20260516120000_consolidate_task_activity.sql
-- introduced. Archive is a field-change on tasks, same shape as status /
-- priority / assignee — no new enum value needed.
--
-- This `create or replace` REPLACES the function defined in
-- 20260517000000_restore_task_update_trigger.sql:9-65. The first 7
-- if-blocks below are copied VERBATIM from that file (title, description,
-- status, priority, assignee_id, sprint_id, due_date). The 8th block is
-- new: archived_at.
create or replace function log_task_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changes jsonb := '{}'::jsonb;
begin
  if new.title is distinct from old.title then
    v_changes := v_changes || jsonb_build_object(
      'title', jsonb_build_object('from', old.title, 'to', new.title)
    );
  end if;
  if new.description is distinct from old.description then
    v_changes := v_changes || jsonb_build_object(
      'description', jsonb_build_object('updated', true)
    );
  end if;
  if new.status is distinct from old.status then
    v_changes := v_changes || jsonb_build_object(
      'status', jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;
  if new.priority is distinct from old.priority then
    v_changes := v_changes || jsonb_build_object(
      'priority', jsonb_build_object('from', old.priority, 'to', new.priority)
    );
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    v_changes := v_changes || jsonb_build_object(
      'assignee_id', jsonb_build_object('from', old.assignee_id, 'to', new.assignee_id)
    );
  end if;
  if new.sprint_id is distinct from old.sprint_id then
    v_changes := v_changes || jsonb_build_object(
      'sprint_id', jsonb_build_object('from', old.sprint_id, 'to', new.sprint_id)
    );
  end if;
  if new.due_date is distinct from old.due_date then
    v_changes := v_changes || jsonb_build_object(
      'due_date', jsonb_build_object('from', old.due_date, 'to', new.due_date)
    );
  end if;
  -- NEW: archive toggle
  if new.archived_at is distinct from old.archived_at then
    v_changes := v_changes || jsonb_build_object(
      'archived_at', jsonb_build_object('from', old.archived_at, 'to', new.archived_at)
    );
  end if;

  if v_changes <> '{}'::jsonb then
    insert into activity_log (task_id, actor_id, action, payload)
    values (new.id, auth.uid(), 'updated', v_changes);
  end if;
  return new;
end;
$$;
