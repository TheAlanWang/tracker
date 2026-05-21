-- ─── Unblock notifications ───
-- When a task's status flips to done/cancelled, find every task it was
-- blocking. For each such task whose ENTIRE chain of open blockers is
-- now empty (i.e. this status change actually unblocks it), fan out an
-- "unblocked" notification to its assignee + reporter + watchers.
--
-- Fires from the trigger context of the user who made the change, so
-- auth.uid() picks up the actor for the notification payload.

-- 1. Extend the notification_type enum.
alter type notification_type add value if not exists 'unblocked';

-- 2. Trigger function.
create or replace function notify_on_unblock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only when transitioning INTO done/cancelled. No need to fire on
  -- updates that don't change the blocker effect.
  if new.status not in ('done', 'cancelled') then
    return new;
  end if;
  if old.status in ('done', 'cancelled') then
    return new;
  end if;

  -- Insert one notification per (target task × interested user). A
  -- DISTINCT on (target, user_id) prevents duplicates when the same
  -- person is both the assignee and a watcher.
  insert into notifications (user_id, type, task_id, actor_id, payload)
  select distinct on (target.id, recipient_id)
    recipient_id,
    'unblocked',
    target.id,
    auth.uid(),
    jsonb_build_object(
      'blocker_identifier', new.identifier,
      'blocker_title', new.title,
      'identifier', target.identifier,
      'title', target.title
    )
  from task_dependencies td
  join tasks target on target.id = td.blocked_task_id
  cross join lateral (
    -- Recipients union: assignee, reporter (if not the actor), all watchers
    select target.assignee_id as recipient_id
    where target.assignee_id is not null
      and target.assignee_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    union
    select target.reporter_id
    where target.reporter_id is not null
      and target.reporter_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
      and target.reporter_id is distinct from target.assignee_id
    union
    select w.user_id
    from task_watchers w
    where w.task_id = target.id
      and w.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  ) recipients
  where td.blocker_task_id = new.id
    -- And only if the target now has NO other open blockers (this
    -- status change really did unblock it).
    and not exists (
      select 1
      from task_dependencies td2
      join tasks b on b.id = td2.blocker_task_id
      where td2.blocked_task_id = target.id
        and td2.blocker_task_id <> new.id
        and b.status not in ('done', 'cancelled')
    );

  return new;
end;
$$;

create trigger tasks_notify_unblock
  after update on tasks
  for each row execute function notify_on_unblock();
