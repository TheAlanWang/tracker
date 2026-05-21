-- The DB trigger log_task_change() can't see auth.uid() when the backend
-- calls Supabase with the service_role key (no JWT, no auth.uid()).
-- Result: all "updated" activity rows have actor_id = NULL → frontend
-- displays "Someone updated X" with no real name.
--
-- Fix: drop the trigger. The backend (which knows the user_id from the
-- bearer token) now writes the activity_log row explicitly inside
-- update_task() with actor_id = user_id.

drop trigger if exists tasks_log_changes on tasks;
drop function if exists log_task_change() cascade;
