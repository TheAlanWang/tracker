-- ─── workspace storage usage ───
-- Sum the bytes of task-image uploads belonging to a workspace, for the
-- Plan section's storage usage display. Task images live in the
-- `task-images` bucket under path `{workspace_id}/{user_id}/{file}`, so
-- the first folder segment identifies the owning workspace.
--
-- Avatars are intentionally excluded — they're user-global (bucket path
-- `{user_id}/...`), tiny (≤2MB), and not workspace-scoped, so they don't
-- count toward a workspace's storage.
--
-- SECURITY DEFINER so it can read storage.objects regardless of the
-- caller; the FastAPI service layer validates workspace membership before
-- calling, and execute is locked to service_role.
create or replace function workspace_storage_bytes(p_workspace_id uuid)
returns bigint
language sql
security definer
set search_path = public, storage
as $$
  select coalesce(sum((metadata->>'size')::bigint), 0)
  from storage.objects
  where bucket_id = 'task-images'
    and (storage.foldername(name))[1] = p_workspace_id::text;
$$;

-- Backend (service_role) is the only intended caller; the frontend reaches
-- this through GET /workspaces/{id}/usage. Revoke from PUBLIC first, then
-- named roles, so anon / authenticated can't call it via any grant path.
revoke execute on function workspace_storage_bytes(uuid)
  from public, anon, authenticated;
