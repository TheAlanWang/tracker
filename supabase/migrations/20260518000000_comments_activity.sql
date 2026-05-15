-- ─── comments ───
create table comments (
  id uuid primary key default uuid_generate_v4(),
  issue_id uuid not null references issues(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index comments_issue_id_idx on comments (issue_id);

create trigger comments_set_updated_at
  before update on comments
  for each row execute function set_updated_at();

alter table comments enable row level security;

create policy "members can read issue comments"
  on comments for select
  using (is_workspace_member((select workspace_id from issues where id = issue_id)));

create policy "members can insert issue comments"
  on comments for insert
  with check (is_workspace_member((select workspace_id from issues where id = issue_id)));

create policy "authors can update own comments"
  on comments for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "authors can delete own comments"
  on comments for delete
  using (author_id = auth.uid());

-- ─── activity_log ───
create type activity_action as enum (
  'status_changed', 'priority_changed', 'assignee_changed',
  'sprint_changed', 'commented', 'created'
);

create table activity_log (
  id uuid primary key default uuid_generate_v4(),
  issue_id uuid not null references issues(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action activity_action not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_log_issue_id_created_at_idx on activity_log (issue_id, created_at desc);

alter table activity_log enable row level security;

create policy "members can read activity"
  on activity_log for select
  using (is_workspace_member((select workspace_id from issues where id = issue_id)));

-- No INSERT/UPDATE/DELETE policies — only triggers (running with definer privileges
-- of the trigger owner) write to activity_log. Manual writes from anon/authenticated
-- via PostgREST will fail because no INSERT policy exists.

-- ─── Trigger: issue field changes ───
create or replace function log_issue_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into activity_log (issue_id, actor_id, action, payload)
    values (new.id, auth.uid(), 'status_changed',
            jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  if new.priority is distinct from old.priority then
    insert into activity_log (issue_id, actor_id, action, payload)
    values (new.id, auth.uid(), 'priority_changed',
            jsonb_build_object('from', old.priority, 'to', new.priority));
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    insert into activity_log (issue_id, actor_id, action, payload)
    values (new.id, auth.uid(), 'assignee_changed',
            jsonb_build_object('from', old.assignee_id, 'to', new.assignee_id));
  end if;
  if new.sprint_id is distinct from old.sprint_id then
    insert into activity_log (issue_id, actor_id, action, payload)
    values (new.id, auth.uid(), 'sprint_changed',
            jsonb_build_object('from', old.sprint_id, 'to', new.sprint_id));
  end if;
  return new;
end;
$$;

create trigger issues_log_changes
  after update on issues
  for each row execute function log_issue_change();

-- ─── Trigger: issue creation ───
create or replace function log_issue_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into activity_log (issue_id, actor_id, action, payload)
  values (new.id, new.reporter_id, 'created',
          jsonb_build_object('identifier', new.identifier, 'title', new.title));
  return new;
end;
$$;

create trigger issues_log_creation
  after insert on issues
  for each row execute function log_issue_created();

-- ─── Trigger: comment posted ───
create or replace function log_comment_posted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into activity_log (issue_id, actor_id, action, payload)
  values (new.issue_id, new.author_id, 'commented',
          jsonb_build_object('comment_id', new.id, 'preview', left(new.body, 200)));
  return new;
end;
$$;

create trigger comments_log_posted
  after insert on comments
  for each row execute function log_comment_posted();
