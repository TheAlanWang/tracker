-- Consolidate task activity: write ONE entry per UPDATE (was: one per field change).
-- Frontend now batches edits and saves explicitly, so a single UPDATE represents
-- a deliberate edit session and deserves one consolidated log entry.

-- Add new enum value for the consolidated action
alter type activity_action add value if not exists 'updated';

-- Replace the trigger function
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
    v_changes := v_changes || jsonb_build_object('description', jsonb_build_object('updated', true));
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

  if v_changes <> '{}'::jsonb then
    insert into activity_log (task_id, actor_id, action, payload)
    values (new.id, auth.uid(), 'updated', v_changes);
  end if;

  return new;
end;
$$;
