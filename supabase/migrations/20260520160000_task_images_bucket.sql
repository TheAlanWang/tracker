-- Public Supabase Storage bucket for images embedded in task descriptions
-- (and, later, comments). Mirrors the avatars bucket pattern: files live
-- under `<user_id>/<filename>` so the RLS folder check pins each upload to
-- its uploader, and reads are public because the markdown img URLs need to
-- render in any client.
--
-- Bigger limit than avatars (5MB vs 2MB): screenshots from retina displays
-- routinely run 3-4MB. PNG / JPEG / WebP / GIF only; SVG is intentionally
-- excluded — public-read + inline-renderable SVG is an XSS footgun.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'task-images',
  'task-images',
  true,
  5 * 1024 * 1024,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public read.
drop policy if exists "anyone reads task images" on storage.objects;
create policy "anyone reads task images"
  on storage.objects for select
  using (bucket_id = 'task-images');

-- Authenticated users can upload to a folder named after their auth.uid.
drop policy if exists "users upload to own task-image folder" on storage.objects;
create policy "users upload to own task-image folder"
  on storage.objects for insert
  with check (
    bucket_id = 'task-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "users update own task images" on storage.objects;
create policy "users update own task images"
  on storage.objects for update
  using (
    bucket_id = 'task-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "users delete own task images" on storage.objects;
create policy "users delete own task images"
  on storage.objects for delete
  using (
    bucket_id = 'task-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
