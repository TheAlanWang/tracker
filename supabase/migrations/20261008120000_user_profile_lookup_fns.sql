-- Targeted user lookups for the backend.
--
-- The backend used auth.admin.list_users() and filtered client-side to
-- render members / watchers / activity actors / mentions and to resolve
-- invite emails. That endpoint is paginated (first page only when no page
-- is passed), so once the instance has more users than one page, users on
-- later pages silently lose their name/avatar, can't be @mentioned, and
-- can't see their own invitations. It also pulls every user on every
-- request. These functions fetch only the rows asked for, by primary key /
-- email index, without exposing the auth schema via PostgREST.

create or replace function public.get_user_profiles(uids uuid[])
returns table (
  id uuid,
  email text,
  display_name text,
  avatar_url text,
  avatar_color text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.id,
    u.email::text,
    u.raw_user_meta_data ->> 'display_name',
    u.raw_user_meta_data ->> 'avatar_url',
    u.raw_user_meta_data ->> 'avatar_color'
  from auth.users u
  where u.id = any(uids);
$$;

-- GoTrue stores emails lowercased, so an equality match on the normalized
-- input can use the auth.users email unique index — which is partial on
-- is_sso_user = false (Trackly has no SSO users; GoTrue's own email lookup
-- uses the same predicate).
create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from auth.users u
  where u.email = lower(trim(p_email))
    and u.is_sso_user = false
  limit 1;
$$;

-- Lock down: these return other users' emails, so only the backend's
-- service role may call them. Clients go through the API's own auth checks.
revoke all on function public.get_user_profiles(uuid[]) from public, anon, authenticated;
grant execute on function public.get_user_profiles(uuid[]) to service_role;
revoke all on function public.find_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.find_user_id_by_email(text) to service_role;

comment on function public.get_user_profiles(uuid[]) is
  'Returns id/email/display_name/avatar_url/avatar_color for the given auth user ids. Service role only.';
comment on function public.find_user_id_by_email(text) is
  'Returns the auth user id for an email (case-insensitive), or null. Service role only.';
