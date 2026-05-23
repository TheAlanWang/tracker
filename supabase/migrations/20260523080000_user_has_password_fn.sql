-- public.user_has_password(uid uuid) — returns whether the given user
-- has a password set on auth.users.
--
-- Why this exists: the frontend needs to render Profile Settings'
-- "Set Password" vs "Change Password" button correctly. The natural
-- proxy — checking auth.identities for a provider='email' row — is
-- wrong: when an OAuth-first user calls supabase.auth.updateUser({
-- password }), Supabase sets auth.users.encrypted_password but does
-- NOT insert a corresponding email identity. The identities array
-- stays Google-only while encrypted_password becomes non-null, so the
-- frontend's identity check shows "Not set" forever.
--
-- The real signal is auth.users.encrypted_password IS NOT NULL. That
-- column is intentionally not exposed to the client and is also not
-- in supabase.auth.admin.get_user_by_id()'s response. Adding a
-- SECURITY DEFINER function gives the backend exactly the one bit it
-- needs, without exposing the auth schema via PostgREST.

create or replace function public.user_has_password(uid uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select coalesce(encrypted_password is not null and encrypted_password <> '', false)
  from auth.users where id = uid;
$$;

-- Lock down: only the backend's service role can call this. authenticated
-- clients should never read it directly via PostgREST — they should go
-- through /me which carries proper auth context.
revoke all on function public.user_has_password(uuid) from public, anon, authenticated;
grant execute on function public.user_has_password(uuid) to service_role;

comment on function public.user_has_password(uuid) is
  'Returns true if auth.users.encrypted_password is set for the given user. '
  'Used by GET /me to surface password presence to the UI. Service role only.';
