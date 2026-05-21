-- Convert task-images from public to private, gate access by workspace
-- membership, and force every render through signed URLs.
--
-- Why: the prior wide-open `using (bucket_id = 'task-images')` SELECT
-- policy let anyone with the project anon key call .list() on the bucket
-- and enumerate every uploaded image. Public read URLs also never expire,
-- so a leaked URL = permanent exposure. Flipping the bucket to private
-- + scoping all four CRUD ops to workspace members (with INSERT also
-- pinning the second path segment to auth.uid) eliminates both classes
-- of leak. Frontend now stores `task-image:<path>` in markdown and calls
-- createSignedUrl to render — see frontend/src/lib/resolveTaskImageUrl.ts.

update storage.buckets
  set public = false
  where id = 'task-images';

drop policy if exists "anyone reads task images" on storage.objects;
drop policy if exists "users upload to own task-image folder" on storage.objects;
drop policy if exists "users update own task images" on storage.objects;
drop policy if exists "users delete own task images" on storage.objects;

-- Path shape: {workspace_id}/{user_id}/{file}. All policies gate on the
-- top folder being a workspace the caller belongs to; INSERT additionally
-- pins the second segment to auth.uid so user A can't drop files into
-- user B's subfolder while still in B's workspace.

drop policy if exists "workspace members read task images" on storage.objects;
create policy "workspace members read task images"
  on storage.objects for select
  using (
    bucket_id = 'task-images'
    and (storage.foldername(name))[1] in (
      select workspace_id::text from public.workspace_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "workspace members upload task images" on storage.objects;
create policy "workspace members upload task images"
  on storage.objects for insert
  with check (
    bucket_id = 'task-images'
    and (storage.foldername(name))[1] in (
      select workspace_id::text from public.workspace_members
      where user_id = auth.uid()
    )
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "workspace members update own task images" on storage.objects;
create policy "workspace members update own task images"
  on storage.objects for update
  using (
    bucket_id = 'task-images'
    and (storage.foldername(name))[1] in (
      select workspace_id::text from public.workspace_members
      where user_id = auth.uid()
    )
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "workspace members delete own task images" on storage.objects;
create policy "workspace members delete own task images"
  on storage.objects for delete
  using (
    bucket_id = 'task-images'
    and (storage.foldername(name))[1] in (
      select workspace_id::text from public.workspace_members
      where user_id = auth.uid()
    )
    and (storage.foldername(name))[2] = auth.uid()::text
  );
