-- Tighten avatars bucket SELECT policy: anon → authenticated.
--
-- Background:
-- The avatars bucket is `public = true`, which means anyone can fetch a
-- file via `/storage/v1/object/public/avatars/<path>` without auth (the
-- public URL path bypasses RLS, by design — that's how <img src> works).
--
-- The bucket also had a wide SELECT RLS policy `using (bucket_id = 'avatars')`
-- which gates the SDK paths: `supabase.storage.from('avatars').list()` and
-- friends. With anon allowed, anyone holding the anon key (anyone who's
-- ever loaded the frontend JS bundle) could call .list() and enumerate
-- every avatar path uploaded to date — a directory listing of all users.
--
-- The Supabase DB linter flags this (lint 0025 public_bucket_allows_listing)
-- because the SELECT policy isn't needed for the public-URL <img src> use
-- case — public buckets don't check RLS on /object/public/ paths.
--
-- Fix: require authenticated for the SELECT path. This blocks anon's
-- .list() enumeration while leaving every existing avatar render
-- (<img src="...storage/v1/object/public/avatars/...">) untouched.
-- Authenticated callers keep .list() in case a future admin / debug UI
-- needs to enumerate.
--
-- No data migration needed — only an RLS policy change. INSERT / UPDATE /
-- DELETE policies (auth.uid()-scoped per-folder) stay as-is.

drop policy if exists "anyone reads avatars" on storage.objects;

create policy "authenticated can list avatars"
  on storage.objects for select
  using (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
  );
