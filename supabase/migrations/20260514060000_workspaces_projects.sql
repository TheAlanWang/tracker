-- Workspaces, members, projects.
-- RLS is defense-in-depth; the FastAPI service layer also enforces ownership.

-- ─── Enums ───
create type workspace_member_role as enum ('owner', 'admin', 'member');

-- ─── workspaces ───
create table workspaces (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workspaces_owner_id_idx on workspaces (owner_id);

-- ─── workspace_members ───
create table workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role workspace_member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_id_idx on workspace_members (user_id);

-- ─── projects ───
create table projects (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  key text not null,
  next_issue_number int not null default 1,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, key)
);

create index projects_workspace_id_idx on projects (workspace_id);

-- ─── updated_at triggers ───
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger workspaces_set_updated_at
  before update on workspaces
  for each row execute function set_updated_at();

create trigger projects_set_updated_at
  before update on projects
  for each row execute function set_updated_at();

-- ─── RLS ───
alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table projects enable row level security;

-- Helper: is the current auth.uid() a member of this workspace?
create or replace function is_workspace_member(ws_id uuid)
returns boolean as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = ws_id and user_id = auth.uid()
  );
$$ language sql security definer set search_path = public;

-- workspaces policies
create policy "members can read their workspaces"
  on workspaces for select
  using (is_workspace_member(id));

create policy "owners can update their workspaces"
  on workspaces for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owners can delete their workspaces"
  on workspaces for delete
  using (owner_id = auth.uid());

create policy "authenticated users can create workspaces"
  on workspaces for insert
  with check (owner_id = auth.uid());

-- workspace_members policies
create policy "members can read membership rows for their workspaces"
  on workspace_members for select
  using (is_workspace_member(workspace_id));

create policy "owners and admins can insert members"
  on workspace_members for insert
  with check (
    exists (
      select 1 from workspace_members
      where workspace_id = workspace_members.workspace_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
    or
    -- bootstrapping: the workspace owner inserts themselves as the first member
    (user_id = auth.uid()
     and exists (
       select 1 from workspaces
       where id = workspace_members.workspace_id and owner_id = auth.uid()
     ))
  );

create policy "owners and admins can update member roles"
  on workspace_members for update
  using (
    exists (
      select 1 from workspace_members
      where workspace_id = workspace_members.workspace_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

create policy "owners and admins can remove members"
  on workspace_members for delete
  using (
    workspace_members.user_id != auth.uid()
    and exists (
      select 1 from workspace_members wm
      where wm.workspace_id = workspace_members.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

-- projects policies
create policy "members can read workspace projects"
  on projects for select
  using (is_workspace_member(workspace_id));

create policy "members can insert workspace projects"
  on projects for insert
  with check (is_workspace_member(workspace_id));

create policy "members can update workspace projects"
  on projects for update
  using (is_workspace_member(workspace_id));

create policy "members can delete workspace projects"
  on projects for delete
  using (is_workspace_member(workspace_id));
