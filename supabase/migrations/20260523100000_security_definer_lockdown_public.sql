-- Follow-up to 20260523090000_security_definer_lockdown.sql.
--
-- That migration revoked EXECUTE from anon + authenticated on a set of
-- SECURITY DEFINER functions, but the linter still flagged them after
-- the migration applied. Root cause: Postgres CREATE FUNCTION grants
-- EXECUTE to PUBLIC by default. anon / authenticated had no explicit
-- grant; they were inheriting EXECUTE via PUBLIC. Revoking from
-- anon / authenticated didn't touch the PUBLIC inheritance, so the
-- effective privilege stayed unchanged.
--
-- Verified via:
--   select has_function_privilege('anon', 'public.X(args)', 'EXECUTE')
-- All 10 returned true after the previous migration applied.
--
-- This migration revokes EXECUTE FROM PUBLIC, which actually severs the
-- inheritance. Triggers continue to fire (Postgres only checks EXECUTE
-- on trigger functions at CREATE TRIGGER time, not at fire time; trigger
-- invocation runs with the function's SECURITY DEFINER owner privilege
-- regardless of the firing user's grant).
--
-- For is_workspace_member specifically, RLS policies on workspaces /
-- workspace_members / tasks / etc. call it during policy evaluation as
-- the authenticated role. We re-grant EXECUTE to authenticated so RLS
-- keeps working; anon still loses access (it never had a useful result
-- anyway because the function relies on auth.uid()).

-- 9 trigger functions — internal, never meant to be called directly
revoke execute on function public.auto_watch_on_assignee_change() from public;
revoke execute on function public.auto_watch_on_task_create() from public;
revoke execute on function public.log_comment_posted() from public;
revoke execute on function public.log_task_change() from public;
revoke execute on function public.log_task_created() from public;
revoke execute on function public.notify_on_assignee_change() from public;
revoke execute on function public.notify_on_comment() from public;
revoke execute on function public.notify_on_status_change() from public;
revoke execute on function public.notify_on_unblock() from public;

-- Backend-only admin function (called by the FastAPI service role when
-- renaming a project key; no anon / authenticated caller should reach
-- it directly).
revoke execute on function public.rename_project_key(uuid, text) from public;

-- RLS helper. PUBLIC revoke removes the implicit grant; explicit grant
-- to authenticated restores the path RLS needs.
revoke execute on function public.is_workspace_member(uuid) from public;
grant  execute on function public.is_workspace_member(uuid) to authenticated;
