-- Plan 1: no app tables yet. This migration is a placeholder that confirms
-- the migration system works. Future migrations (Plan 2+) will add tables.

-- Enable required extensions for later plans
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Verify Supabase auth schema is present (it should be, set up by Supabase itself)
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'auth') then
    raise exception 'Supabase auth schema is missing; check supabase setup';
  end if;
end
$$;
