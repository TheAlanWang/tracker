-- Lock down SECURITY DEFINER functions surfaced by Supabase's DB linter.
--
-- Two classes of issue:
--
--   (1) search_path hijack on set_updated_at(): without an explicit
--       `set search_path = ''`, an attacker who can `set search_path`
--       on their session can shadow tables referenced inside the
--       function and trick a superuser-privileged definer call into
--       touching attacker-controlled objects. Set the function's
--       search_path to empty so all references must be fully qualified.
--
--   (2) PostgREST auto-exposes every public.<func> as
--       /rest/v1/rpc/<func>. For internal SECURITY DEFINER helpers
--       (triggers, RLS predicates, backend-only admin functions),
--       anyone with the anon key could call them directly. Revoke
--       EXECUTE from anon + authenticated; backend keeps access via
--       the service_role (which bypasses these grants).
--
-- Triggers still fire normally after the revoke — trigger invocation
-- is internal to Postgres and doesn't check the firing role's EXECUTE
-- privilege on the function. Only direct callable surface is removed.

-- (1) Search-path hardening
alter function public.set_updated_at() set search_path = '';

-- (2a) Trigger functions — internal, never meant to be RPC'd
revoke execute on function public.auto_watch_on_assignee_change() from anon, authenticated;
revoke execute on function public.auto_watch_on_task_create() from anon, authenticated;
revoke execute on function public.log_comment_posted() from anon, authenticated;
revoke execute on function public.log_task_change() from anon, authenticated;
revoke execute on function public.log_task_created() from anon, authenticated;
revoke execute on function public.notify_on_assignee_change() from anon, authenticated;
revoke execute on function public.notify_on_comment() from anon, authenticated;
revoke execute on function public.notify_on_status_change() from anon, authenticated;
revoke execute on function public.notify_on_unblock() from anon, authenticated;

-- (2b) Admin-only function: rename_project_key bulk-renames task
-- identifiers in a project; meant to be called only by the backend
-- service role when an admin updates the project key. Frontend should
-- not invoke directly.
revoke execute on function public.rename_project_key(uuid, text) from anon, authenticated;

-- (2c) is_workspace_member: this one is a special case. RLS policies
-- on workspaces / workspace_members / projects / tasks / etc. all
-- reference it; policy evaluation runs as the calling role
-- (authenticated), so authenticated MUST keep EXECUTE for RLS to
-- work. anon never has a meaningful result (auth.uid() is null →
-- always returns false), so revoking from anon kills the PostgREST
-- exposure for anonymous callers without breaking anything. The
-- residual authenticated_security_definer_function_executable
-- warning is accepted: a signed-in user calling /rpc/is_workspace_member
-- only learns whether THEY are in a given workspace, which is data
-- they already see via /me's workspace list.
revoke execute on function public.is_workspace_member(uuid) from anon;
