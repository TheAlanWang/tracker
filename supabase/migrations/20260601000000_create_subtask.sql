-- ─── create_subtask_with_identifier RPC ───
-- Adds a child task under an existing parent. Inherits workspace/project
-- from the parent so callers only need parent_task_id + title (plus optional
-- description / priority / assignee). Uses the same identifier-numbering
-- mechanism as create_task_with_identifier so subtasks get the next number
-- within the project (e.g. parent FE-12, subtask FE-13 — no special prefix).
--
-- Why a new function instead of overloading create_task_with_identifier:
-- the existing function's signature is referenced by an explicit `revoke
-- execute` in the same migration, so changing it requires either dropping
-- and recreating with the new arg list, or carrying an overloaded variant.
-- Adding a dedicated subtask function is clearer at the call site and
-- keeps the original signature stable.

create or replace function create_subtask_with_identifier(
  p_parent_task_id uuid,
  p_title text,
  p_description text,
  p_priority task_priority,
  p_assignee_id uuid,
  p_due_date date,
  p_reporter_id uuid
) returns tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent tasks;
  v_task_number int;
  v_project_key text;
  v_identifier text;
  v_task tasks;
begin
  select * into v_parent from tasks where id = p_parent_task_id;
  if v_parent is null then
    raise exception 'parent task not found: %', p_parent_task_id using errcode = 'P0002';
  end if;

  -- Disallow grandchildren — keep the hierarchy single-level so the UI
  -- stays simple. Easy to relax later.
  if v_parent.parent_id is not null then
    raise exception 'cannot create a subtask under a subtask' using errcode = 'P0001';
  end if;

  update projects
  set next_task_number = next_task_number + 1
  where id = v_parent.project_id and workspace_id = v_parent.workspace_id
  returning next_task_number - 1, key
  into v_task_number, v_project_key;

  v_identifier := v_project_key || '-' || v_task_number;

  insert into tasks (
    workspace_id, project_id, parent_id, identifier, title, description,
    status, priority, assignee_id, reporter_id, due_date
  ) values (
    v_parent.workspace_id, v_parent.project_id, p_parent_task_id,
    v_identifier, p_title, coalesce(p_description, ''),
    'backlog'::task_status,
    coalesce(p_priority, 'no_priority'::task_priority),
    p_assignee_id, p_reporter_id, p_due_date
  )
  returning * into v_task;

  return v_task;
end;
$$;

revoke execute on function create_subtask_with_identifier(uuid, text, text, task_priority, uuid, date, uuid) from public, anon, authenticated;
