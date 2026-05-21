create table labels (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  color text not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create index labels_workspace_id_idx on labels (workspace_id);

alter table labels enable row level security;

create policy "members can read workspace labels"
  on labels for select
  using (is_workspace_member(workspace_id));

create policy "members can insert workspace labels"
  on labels for insert
  with check (is_workspace_member(workspace_id));

create policy "members can update workspace labels"
  on labels for update
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

create policy "members can delete workspace labels"
  on labels for delete
  using (is_workspace_member(workspace_id));

-- ─── issue_labels ───
create table issue_labels (
  issue_id uuid not null references issues(id) on delete cascade,
  label_id uuid not null references labels(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (issue_id, label_id)
);

create index issue_labels_label_id_idx on issue_labels (label_id);

alter table issue_labels enable row level security;

-- Members of the issue's workspace can read/insert/delete the join row.
create policy "members can read issue_labels"
  on issue_labels for select
  using (is_workspace_member((select workspace_id from issues where id = issue_id)));

create policy "members can insert issue_labels"
  on issue_labels for insert
  with check (is_workspace_member((select workspace_id from issues where id = issue_id)));

create policy "members can delete issue_labels"
  on issue_labels for delete
  using (is_workspace_member((select workspace_id from issues where id = issue_id)));
