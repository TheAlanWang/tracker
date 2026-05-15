-- Fix complete_sprint() — was created before the issues → tasks rename
-- (migration 20260522000000) and still references the old `issues` table,
-- so calls now error with "relation 'issues' does not exist".

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
  select * into v_sprint from sprints where id = p_sprint_id for update;
  if v_sprint.id is null then
    raise exception 'sprint not found' using errcode = 'P0002';
  end if;
  if v_sprint.status != 'active' then
    raise exception 'sprint is not active' using errcode = 'P0001';
  end if;

  select id into v_next_planned_id
  from sprints
  where project_id = v_sprint.project_id
    and status = 'planned'
  order by start_at asc nulls last, created_at asc
  limit 1;

  -- Roll over unfinished tasks (sprint_id NULL = back to backlog)
  update tasks
  set sprint_id = v_next_planned_id
  where sprint_id = p_sprint_id
    and status not in ('done', 'cancelled');

  get diagnostics v_rolled_count = row_count;

  update sprints set status = 'completed' where id = p_sprint_id;

  return jsonb_build_object(
    'completed', p_sprint_id,
    'rolled_over_to', v_next_planned_id,
    'count', v_rolled_count
  );
end;
$$;

revoke execute on function complete_sprint(uuid) from public, anon, authenticated;
