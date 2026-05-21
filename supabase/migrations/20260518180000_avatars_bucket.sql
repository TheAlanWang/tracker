-- Public Supabase Storage bucket for user avatars.
--
-- Files are organised as `<user_id>/<filename>`; the RLS policies below let
-- a user write only inside their own folder, while anyone (signed in or
-- not) can read — avatars need to be visible everywhere the app surfaces a
-- user, including OAuth-style flows where the requester might be anonymous.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2 * 1024 * 1024,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public read.
drop policy if exists "anyone reads avatars" on storage.objects;
create policy "anyone reads avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Authenticated users can upload to a folder named after their auth.uid.
-- storage.foldername(name) returns the path segments; the first segment is
-- the top-level folder.
drop policy if exists "users upload to own avatar folder" on storage.objects;
create policy "users upload to own avatar folder"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Same scoping for update + delete so a user can replace / remove their
-- own avatar but nobody else's.
drop policy if exists "users update own avatars" on storage.objects;
create policy "users update own avatars"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "users delete own avatars" on storage.objects;
create policy "users delete own avatars"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
