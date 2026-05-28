-- ─── Fix: new task position = end of its (project, status) column ───
-- Previously, `create_task_with_identifier` INSERTed without specifying
-- `position`, falling back to the column default of 0. Tasks that had
-- been arranged via drag-and-drop sat at positive floats (1000, 2000,
-- (1000+2000)/2=1500, …), so a freshly-created task at position 0
-- sorted to the TOP of its column — opposite of where the "+ Add task"
-- button visually sits at the column bottom.
--
-- Fix: compute `position = max(existing positions in same column) + 1000`
-- atomically in the same RPC that allocates the identifier. Mirrors
-- Board.tsx's drag-to-end logic (`column[length-1].position + 1000`),
-- making create-at-bottom and drag-to-end behave identically.
--
-- This `create or replace` keeps the function signature and the
-- identifier-allocation block from 20260516060000 verbatim; only the
-- new position computation and the position column on INSERT are added.

create or replace function create_task_with_identifier(
  p_workspace_id uuid,
  p_project_id uuid,
  p_title text,
  p_description text,
  p_priority task_priority,
  p_status task_status,
  p_assignee_id uuid,
  p_due_date date,
  p_reporter_id uuid
) returns tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task_number int;
  v_project_key text;
  v_identifier text;
  v_status task_status;
  v_position double precision;
  v_task tasks;
begin
  -- Atomic identifier allocation — verbatim from 20260516060000.
  -- Filtering by BOTH id and workspace_id guards against PostgREST
  -- callers supplying a mismatched workspace/project pair.
  update projects
  set next_task_number = next_task_number + 1
  where id = p_project_id and workspace_id = p_workspace_id
  returning next_task_number - 1, key
  into v_task_number, v_project_key;

  if v_task_number is null then
    raise exception 'project not found: %', p_project_id
      using errcode = 'P0002';
  end if;

  v_identifier := v_project_key || '-' || v_task_number;

  -- End-of-column position. Empty column → -1000 + 1000 = 0
  -- (matches Board.tsx:680). Non-empty → max + 1000.
  v_status := coalesce(p_status, 'backlog'::task_status);
  select coalesce(max(position), -1000) + 1000
    into v_position
    from tasks
    where project_id = p_project_id and status = v_status;

  insert into tasks (
    workspace_id, project_id, identifier, title, description,
    status, priority, assignee_id, reporter_id, due_date, position
  ) values (
    p_workspace_id, p_project_id, v_identifier, p_title, coalesce(p_description, ''),
    v_status,
    coalesce(p_priority, 'no_priority'::task_priority),
    p_assignee_id, p_reporter_id, p_due_date, v_position
  )
  returning * into v_task;

  return v_task;
end;
$$;
