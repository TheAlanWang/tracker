-- Notify inviters when their invitations are accepted or declined.
--
-- Two changes:
--   1. Extend the notification_type enum with invitation_accepted /
--      invitation_declined. These aren't tied to a task, so:
--   2. Relax notifications.task_id to allow NULL (it stays a FK to tasks for
--      task-centric notification types; invitation notifications use NULL).
--
-- The router/service layer is the source of truth for which type allows a
-- NULL task_id, mirroring how the rest of this codebase prefers app-level
-- constraints over DB-level CHECK constraints (see workspace_members).

alter type notification_type add value if not exists 'invitation_accepted';
alter type notification_type add value if not exists 'invitation_declined';

alter table notifications alter column task_id drop not null;
