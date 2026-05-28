-- ─── ownership transfer notification ───
-- Notify the new owner when a workspace is transferred to them. Reuses the
-- workspace-scoped notification shape (task_id null, payload carries
-- workspace_id + name) established by invitation_accepted / _declined.
alter type notification_type add value if not exists 'ownership_transferred';
