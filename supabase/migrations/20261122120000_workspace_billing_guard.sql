-- ─── Guard server-managed billing columns on workspaces ───
--
-- The owner UPDATE / INSERT policies on workspaces are row-level only
-- (owner_id = auth.uid()), so any signed-in owner could PATCH
-- plan = 'pro' (or the stripe_* ids) straight through PostgREST with the
-- publishable key and skip payment. RLS can't restrict columns, so this
-- trigger does.
--
-- Who is blocked: only client roles (anon / authenticated), i.e. requests
-- coming from a browser with a user token.
-- Who is allowed:
--   * the backend: every backend client sends a JWT with role=service_role
--     (get_supabase_admin, Stripe webhook _set_plan)
--   * manual SQL in Studio / psql (role postgres, no JWT → auth.role() is
--     null) — keeps the "manually comped Pro" path working.
--
-- INSERT: column defaults are applied before BEFORE triggers run, so a
-- normal insert arrives here with plan = 'free' and null stripe ids.

create or replace function public.workspaces_guard_billing_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.plan is distinct from 'free'
       or new.stripe_customer_id is not null
       or new.stripe_subscription_id is not null then
      raise exception 'billing fields are server-managed'
        using errcode = '42501';  -- insufficient_privilege → PostgREST 403
    end if;
  elsif new.plan is distinct from old.plan
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id then
    raise exception 'billing fields are server-managed'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Trigger functions can't be called directly, but keep the surface minimal
-- (matches the security_definer_lockdown migrations).
revoke execute on function public.workspaces_guard_billing_fields() from public, anon, authenticated;

create trigger workspaces_guard_billing_fields
  before insert or update on public.workspaces
  for each row execute function public.workspaces_guard_billing_fields();
