-- Rename issues domain to tasks throughout

-- 1. Drop triggers (they reference table name)
drop trigger if exists issues_set_updated_at on issues;
drop trigger if exists issues_log_changes on issues;
drop trigger if exists issues_log_creation on issues;
drop trigger if exists issues_notify_assignee on issues;

-- 2. Drop trigger functions (recreated below referencing new names)
drop function if exists log_issue_change() cascade;
drop function if exists log_issue_created() cascade;
drop function if exists notify_on_assignee_change() cascade;
drop function if exists notify_on_comment() cascade;
drop function if exists create_issue_with_identifier(uuid, uuid, text, text, issue_priority, issue_status, uuid, date, uuid) cascade;

-- 3. Drop activity_action enum value 'commented'? No, keep enum — just reuse for tasks.
-- The activity_action enum has values like 'status_changed', 'commented', etc. Keep as-is.

-- 4. Rename column on join table
alter table issue_labels rename column issue_id to task_id;
alter table issue_labels rename to task_labels;
alter index if exists issue_labels_label_id_idx rename to task_labels_label_id_idx;

-- 5. Rename activity_log.issue_id → task_id
alter table activity_log rename column issue_id to task_id;

-- 6. Rename comments.issue_id → task_id
alter table comments rename column issue_id to task_id;

-- 7. Rename notifications.issue_id → task_id
alter table notifications rename column issue_id to task_id;

-- 8. Rename issues table → tasks
alter table issues rename to tasks;
alter index if exists issues_project_id_status_idx rename to tasks_project_id_status_idx;
alter index if exists issues_assignee_id_idx rename to tasks_assignee_id_idx;

-- 9. Rename project counter
alter table projects rename column next_issue_number to next_task_number;

-- 10. Rename enums
alter type issue_status rename to task_status;
alter type issue_priority rename to task_priority;

-- 11. Recreate trigger function for set_updated_at trigger
create trigger tasks_set_updated_at
  before update on tasks
  for each row execute function set_updated_at();

-- 12. Recreate log_task_change function + trigger
create or replace function log_task_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into activity_log (task_id, actor_id, action, payload)
    values (new.id, auth.uid(), 'status_changed',
            jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  if new.priority is distinct from old.priority then
    insert into activity_log (task_id, actor_id, action, payload)
    values (new.id, auth.uid(), 'priority_changed',
            jsonb_build_object('from', old.priority, 'to', new.priority));
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    insert into activity_log (task_id, actor_id, action, payload)
    values (new.id, auth.uid(), 'assignee_changed',
            jsonb_build_object('from', old.assignee_id, 'to', new.assignee_id));
  end if;
  if new.sprint_id is distinct from old.sprint_id then
    insert into activity_log (task_id, actor_id, action, payload)
    values (new.id, auth.uid(), 'sprint_changed',
            jsonb_build_object('from', old.sprint_id, 'to', new.sprint_id));
  end if;
  return new;
end;
$$;

create trigger tasks_log_changes
  after update on tasks
  for each row execute function log_task_change();

-- 13. log_task_created
create or replace function log_task_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into activity_log (task_id, actor_id, action, payload)
  values (new.id, new.reporter_id, 'created',
          jsonb_build_object('identifier', new.identifier, 'title', new.title));
  return new;
end;
$$;

create trigger tasks_log_creation
  after insert on tasks
  for each row execute function log_task_created();

-- 14. log_comment_posted needs to update column name
create or replace function log_comment_posted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into activity_log (task_id, actor_id, action, payload)
  values (new.task_id, new.author_id, 'commented',
          jsonb_build_object('comment_id', new.id, 'preview', left(new.body, 200)));
  return new;
end;
$$;

drop trigger if exists comments_log_posted on comments;
create trigger comments_log_posted
  after insert on comments
  for each row execute function log_comment_posted();

-- 15. notify_on_assignee_change (rename column references inside)
create or replace function notify_on_assignee_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_id is distinct from old.assignee_id
     and new.assignee_id is not null
     and new.assignee_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) then
    insert into notifications (user_id, type, task_id, actor_id, payload)
    values (new.assignee_id, 'assigned', new.id, auth.uid(),
            jsonb_build_object('identifier', new.identifier, 'title', new.title));
  end if;
  return new;
end;
$$;

create trigger tasks_notify_assignee
  after update on tasks
  for each row execute function notify_on_assignee_change();

-- 16. notify_on_comment (uses task_id now)
create or replace function notify_on_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_task tasks;
begin
  select * into v_task from tasks where id = new.task_id;
  if v_task.reporter_id is not null
     and v_task.reporter_id <> coalesce(new.author_id, '00000000-0000-0000-0000-000000000000'::uuid) then
    insert into notifications (user_id, type, task_id, actor_id, payload)
    values (v_task.reporter_id, 'commented', new.task_id, new.author_id,
            jsonb_build_object('comment_id', new.id, 'preview', left(new.body, 200)));
  end if;
  if v_task.assignee_id is not null
     and v_task.assignee_id <> coalesce(new.author_id, '00000000-0000-0000-0000-000000000000'::uuid)
     and v_task.assignee_id <> coalesce(v_task.reporter_id, '00000000-0000-0000-0000-000000000000'::uuid) then
    insert into notifications (user_id, type, task_id, actor_id, payload)
    values (v_task.assignee_id, 'commented', new.task_id, new.author_id,
            jsonb_build_object('comment_id', new.id, 'preview', left(new.body, 200)));
  end if;
  return new;
end;
$$;

create trigger comments_notify
  after insert on comments
  for each row execute function notify_on_comment();

-- 17. create_task_with_identifier RPC
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
  v_task tasks;
begin
  update projects
  set next_task_number = next_task_number + 1
  where id = p_project_id and workspace_id = p_workspace_id
  returning next_task_number - 1, key
  into v_task_number, v_project_key;

  if v_task_number is null then
    raise exception 'project not found: %', p_project_id using errcode = 'P0002';
  end if;

  v_identifier := v_project_key || '-' || v_task_number;

  insert into tasks (
    workspace_id, project_id, identifier, title, description,
    status, priority, assignee_id, reporter_id, due_date
  ) values (
    p_workspace_id, p_project_id, v_identifier, p_title, coalesce(p_description, ''),
    coalesce(p_status, 'backlog'::task_status),
    coalesce(p_priority, 'no_priority'::task_priority),
    p_assignee_id, p_reporter_id, p_due_date
  )
  returning * into v_task;

  return v_task;
end;
$$;

revoke execute on function create_task_with_identifier(uuid, uuid, text, text, task_priority, task_status, uuid, date, uuid) from public, anon, authenticated;
