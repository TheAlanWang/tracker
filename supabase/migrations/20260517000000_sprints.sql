-- Sprints + complete_sprint RPC. Adds the FK on issues.sprint_id that
-- Plan 3 deferred.

create type sprint_status as enum ('planned', 'active', 'completed');

create table sprints (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  status sprint_status not null default 'planned',
  start_at timestamptz,
  end_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sprints_project_id_status_idx on sprints (project_id, status);

-- Only one 'active' sprint per project. Partial unique index.
create unique index sprints_one_active_per_project
  on sprints (project_id)
  where status = 'active';

create trigger sprints_set_updated_at
  before update on sprints
  for each row execute function set_updated_at();

-- Add the FK from Plan 3 (issues.sprint_id was a plain uuid before).
alter table issues
  add constraint issues_sprint_id_fkey
  foreign key (sprint_id) references sprints(id) on delete set null;

-- RLS
alter table sprints enable row level security;

-- Membership derived via projects.workspace_id (sprints has no workspace_id).
create policy "members can read project sprints"
  on sprints for select
  using (is_workspace_member((select workspace_id from projects where id = project_id)));

create policy "members can insert project sprints"
  on sprints for insert
  with check (is_workspace_member((select workspace_id from projects where id = project_id)));

create policy "members can update project sprints"
  on sprints for update
  using (is_workspace_member((select workspace_id from projects where id = project_id)))
  with check (is_workspace_member((select workspace_id from projects where id = project_id)));

create policy "members can delete project sprints"
  on sprints for delete
  using (is_workspace_member((select workspace_id from projects where id = project_id)));

-- complete_sprint: atomically rolls over unfinished issues + marks sprint completed.
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
  -- Lock + verify
  select * into v_sprint from sprints where id = p_sprint_id for update;
  if v_sprint.id is null then
    raise exception 'sprint not found' using errcode = 'P0002';
  end if;
  if v_sprint.status != 'active' then
    raise exception 'sprint is not active' using errcode = 'P0001';
  end if;

  -- Find the next planned sprint in same project
  select id into v_next_planned_id
  from sprints
  where project_id = v_sprint.project_id
    and status = 'planned'
  order by start_at asc nulls last, created_at asc
  limit 1;

  -- Roll over unfinished issues (sprint_id can become NULL = back to backlog)
  update issues
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
