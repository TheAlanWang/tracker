-- Issues + identifier-allocating RPC.
-- RLS is defense-in-depth; the FastAPI service layer also enforces membership.

-- ─── Enums ───
create type issue_status as enum
  ('backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled');

create type issue_priority as enum
  ('no_priority', 'urgent', 'high', 'medium', 'low');

-- ─── issues ───
-- Note: sprint_id column exists but has NO FK constraint in Plan 3 because
-- the `sprints` table is introduced in Plan 4. Plan 4 will add the FK via
-- ALTER TABLE. parent_id (sub-issues) similarly always null in Plan 3.
create table issues (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  sprint_id uuid,                                                       -- FK deferred to Plan 4
  parent_id uuid references issues(id) on delete set null,
  identifier text not null,
  title text not null,
  description text not null default '',
  status issue_status not null default 'backlog',
  priority issue_priority not null default 'no_priority',
  assignee_id uuid references auth.users(id) on delete set null,
  reporter_id uuid references auth.users(id) on delete set null,
  due_date date,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, identifier)
);

create index issues_project_id_status_idx on issues (project_id, status);
create index issues_assignee_id_idx on issues (assignee_id) where assignee_id is not null;

create trigger issues_set_updated_at
  before update on issues
  for each row execute function set_updated_at();

-- ─── RLS ───
alter table issues enable row level security;

create policy "members can read workspace issues"
  on issues for select
  using (is_workspace_member(workspace_id));

create policy "members can insert workspace issues"
  on issues for insert
  with check (is_workspace_member(workspace_id));

create policy "members can update workspace issues"
  on issues for update
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

create policy "members can delete workspace issues"
  on issues for delete
  using (is_workspace_member(workspace_id));

-- ─── Atomic identifier-allocating RPC ───
-- Locks the project row, increments next_issue_number, computes identifier,
-- inserts the issue. Returns the inserted row.
-- SECURITY DEFINER: bypasses RLS for the project read/update + issue insert.
-- Caller (FastAPI service layer) must validate workspace membership first.
create or replace function create_issue_with_identifier(
  p_workspace_id uuid,
  p_project_id uuid,
  p_title text,
  p_description text,
  p_priority issue_priority,
  p_status issue_status,
  p_assignee_id uuid,
  p_due_date date,
  p_reporter_id uuid
) returns issues
language plpgsql
security definer
set search_path = public
as $$
declare
  v_issue_number int;
  v_project_key text;
  v_identifier text;
  v_issue issues;
begin
  -- Atomically read+increment counter on the locked project row.
  -- Filtering by BOTH id and workspace_id guards against PostgREST callers
  -- supplying a mismatched workspace/project pair to corrupt another
  -- workspace's counter.
  -- RETURNING `next_issue_number - 1` gives the value BEFORE increment,
  -- which is the number we use for this new issue.
  update projects
  set next_issue_number = next_issue_number + 1
  where id = p_project_id and workspace_id = p_workspace_id
  returning next_issue_number - 1, key
  into v_issue_number, v_project_key;

  if v_issue_number is null then
    raise exception 'project not found: %', p_project_id
      using errcode = 'P0002';
  end if;

  v_identifier := v_project_key || '-' || v_issue_number;

  insert into issues (
    workspace_id, project_id, identifier, title, description,
    status, priority, assignee_id, reporter_id, due_date
  ) values (
    p_workspace_id, p_project_id, v_identifier, p_title, coalesce(p_description, ''),
    coalesce(p_status, 'backlog'::issue_status),
    coalesce(p_priority, 'no_priority'::issue_priority),
    p_assignee_id, p_reporter_id, p_due_date
  )
  returning * into v_issue;

  return v_issue;
end;
$$;

-- Lock the RPC down: only callable by service_role (the FastAPI backend).
-- The frontend has no need to call this directly; issues are created
-- through the FastAPI /projects/{p_id}/issues endpoint.
-- Revoke from PUBLIC first (Postgres default grant), then named roles to
-- ensure anon and authenticated cannot reach it via any grant path.
revoke execute on function create_issue_with_identifier(
  uuid, uuid, text, text, issue_priority, issue_status, uuid, date, uuid
) from public, anon, authenticated;
