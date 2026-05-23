-- Per-project threshold for transactional email notifications on task
-- assignment.
--
-- Values:
--   'off'    — never email assignees
--   'urgent' — only when the task is urgent
--   'high'   — when the task is high or urgent
--   'any'    — every assignment, regardless of priority
--
-- Semantics: emails fire when an assignment "enters" the threshold zone.
-- Concretely, that means: create-with-assignee, reassign, and priority
-- bumps that cross the threshold (e.g. medium → urgent with the 'urgent'
-- threshold). The actor is never emailed for their own action.
--
-- Defaults to 'off' so the feature is opt-in: a project admin must
-- consciously turn it on in Project Settings. Avoids surprising existing
-- teams with a flood of emails on deploy day.

alter table public.projects
  add column notify_assignee_threshold text not null default 'off'
    check (notify_assignee_threshold in ('off', 'urgent', 'high', 'any'));

comment on column public.projects.notify_assignee_threshold is
  'Priority threshold for emailing assignees on task assignment. '
  'One of: off, urgent, high, any. Defaults to off (opt-in).';
