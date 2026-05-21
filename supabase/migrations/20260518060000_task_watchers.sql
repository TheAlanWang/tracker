-- Watchers system: let users follow a task's lifecycle (comments, status
-- changes) without being its assignee.
--
-- Why: today the "My Tasks" view shows only tasks where assignee = me. As
-- soon as you reassign a task you raised, it disappears from your radar.
-- Watchers fix this: reporter + every past assignee are auto-subscribed,
-- and anyone in the workspace can opt in via the TaskDetail "Watch" button.
-- Notifications (comments, status changes) fan out to the watcher set.

create table task_watchers (
  task_id uuid not null references tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create index task_watchers_user_id_idx on task_watchers (user_id);

alter table task_watchers enable row level security;

-- Anyone in the workspace can see who watches a task.
create policy "members read watchers in their workspaces"
  on task_watchers for select
  using (
    exists (
      select 1 from tasks t
      where t.id = task_watchers.task_id
        and is_workspace_member(t.workspace_id)
    )
  );

-- Watch a task you have access to (you're a workspace member). Users can
-- only insert their own user_id; the assignee/reporter auto-subscriptions
-- below use security definer triggers and bypass this.
create policy "users watch tasks in their workspaces"
  on task_watchers for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from tasks t
      where t.id = task_id and is_workspace_member(t.workspace_id)
    )
  );

-- Unwatch only your own subscription.
create policy "users unwatch themselves"
  on task_watchers for delete
  using (user_id = auth.uid());

-- ─── Auto-subscribe: reporter (and assignee, if set) on task creation ───
create or replace function auto_watch_on_task_create()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.reporter_id is not null then
    insert into task_watchers (task_id, user_id)
    values (new.id, new.reporter_id)
    on conflict do nothing;
  end if;
  if new.assignee_id is not null
     and new.assignee_id is distinct from new.reporter_id then
    insert into task_watchers (task_id, user_id)
    values (new.id, new.assignee_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger tasks_auto_watch_create
  after insert on tasks
  for each row execute function auto_watch_on_task_create();

-- ─── Auto-subscribe: new assignee on every reassign ───
create or replace function auto_watch_on_assignee_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_id is distinct from old.assignee_id
     and new.assignee_id is not null then
    insert into task_watchers (task_id, user_id)
    values (new.id, new.assignee_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger tasks_auto_watch_assignee
  after update on tasks
  for each row execute function auto_watch_on_assignee_change();

-- ─── Backfill: existing tasks. Reporter + current assignee become watchers. ───
insert into task_watchers (task_id, user_id)
select id, reporter_id from tasks where reporter_id is not null
on conflict do nothing;

insert into task_watchers (task_id, user_id)
select id, assignee_id from tasks where assignee_id is not null
on conflict do nothing;

-- ─── Rewrite comment notification to fan out to watchers ───
-- Previously: notify reporter + assignee. Now: notify everyone watching
-- (excluding the author). Reporter + assignee are auto-watchers so the
-- old behavior is preserved, plus anyone who opted in.
create or replace function notify_on_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_task tasks;
  v_no_user constant uuid := '00000000-0000-0000-0000-000000000000'::uuid;
begin
  select * into v_task from tasks where id = new.task_id;
  insert into notifications (user_id, type, task_id, actor_id, payload)
  select w.user_id, 'commented', new.task_id, new.author_id,
         jsonb_build_object(
           'identifier', v_task.identifier,
           'title', v_task.title,
           'comment_id', new.id,
           'preview', left(new.body, 200)
         )
  from task_watchers w
  where w.task_id = new.task_id
    and w.user_id <> coalesce(new.author_id, v_no_user);
  return new;
end;
$$;

-- ─── New: status change notification, fanned out to watchers ───
create or replace function notify_on_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_no_user constant uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  v_actor uuid;
begin
  if new.status is distinct from old.status then
    v_actor := coalesce(auth.uid(), v_no_user);
    insert into notifications (user_id, type, task_id, actor_id, payload)
    select w.user_id, 'status_changed', new.id, auth.uid(),
           jsonb_build_object(
             'identifier', new.identifier,
             'title', new.title,
             'from', old.status,
             'to', new.status
           )
    from task_watchers w
    where w.task_id = new.id
      and w.user_id <> v_actor;
  end if;
  return new;
end;
$$;

create trigger tasks_notify_status_change
  after update on tasks
  for each row execute function notify_on_status_change();
