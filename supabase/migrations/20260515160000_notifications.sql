-- ─── notification_type enum ───
create type notification_type as enum (
  'assigned', 'mentioned', 'commented', 'status_changed'
);

-- ─── notifications table ───
create table notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type notification_type not null,
  issue_id uuid not null references issues(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_id_read_at_idx on notifications (user_id, read_at);

alter table notifications enable row level security;

create policy "users read own notifications"
  on notifications for select
  using (user_id = auth.uid());

create policy "users update own notifications"
  on notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── Trigger: assignee change ───
create or replace function notify_on_assignee_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_id is distinct from old.assignee_id
     and new.assignee_id is not null
     and new.assignee_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) then
    insert into notifications (user_id, type, issue_id, actor_id, payload)
    values (new.assignee_id, 'assigned', new.id, auth.uid(),
            jsonb_build_object('identifier', new.identifier, 'title', new.title));
  end if;
  return new;
end;
$$;

create trigger issues_notify_assignee
  after update on issues
  for each row execute function notify_on_assignee_change();

-- ─── Trigger: comment posted ───
create or replace function notify_on_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_issue issues;
begin
  select * into v_issue from issues where id = new.issue_id;
  -- Notify reporter if not the author
  if v_issue.reporter_id is not null
     and v_issue.reporter_id <> coalesce(new.author_id, '00000000-0000-0000-0000-000000000000'::uuid) then
    insert into notifications (user_id, type, issue_id, actor_id, payload)
    values (v_issue.reporter_id, 'commented', new.issue_id, new.author_id,
            jsonb_build_object('comment_id', new.id, 'preview', left(new.body, 200)));
  end if;
  -- Notify assignee if not the author AND not the reporter (avoid double notification)
  if v_issue.assignee_id is not null
     and v_issue.assignee_id <> coalesce(new.author_id, '00000000-0000-0000-0000-000000000000'::uuid)
     and v_issue.assignee_id <> coalesce(v_issue.reporter_id, '00000000-0000-0000-0000-000000000000'::uuid) then
    insert into notifications (user_id, type, issue_id, actor_id, payload)
    values (v_issue.assignee_id, 'commented', new.issue_id, new.author_id,
            jsonb_build_object('comment_id', new.id, 'preview', left(new.body, 200)));
  end if;
  return new;
end;
$$;

create trigger comments_notify
  after insert on comments
  for each row execute function notify_on_comment();
