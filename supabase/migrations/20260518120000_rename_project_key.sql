-- RPC for renaming a project's key + all its task identifiers in one
-- transaction. Linear / Jira-style: changing the key rewrites every
-- existing task's identifier from OLD-N to NEW-N so the project's history
-- stays consistent.
--
-- Splitting on the first '-' is reliable because the identifier format is
-- `<KEY>-<NUMBER>` where KEY itself is `[A-Z][A-Z0-9]*` (no dashes), so
-- substring-from-the-dash captures the numeric suffix unambiguously.

create or replace function rename_project_key(
  p_project_id uuid,
  p_new_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Update tasks first, then the project. If the project update fails
  -- (e.g., unique constraint violation on workspace_id+key), the implicit
  -- transaction rolls back the task identifier changes too.
  update tasks
  set identifier = p_new_key || substring(identifier from position('-' in identifier))
  where project_id = p_project_id;

  update projects
  set key = p_new_key,
      updated_at = now()
  where id = p_project_id;
end;
$$;
