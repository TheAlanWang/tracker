-- Per-workspace display name ("nickname") for a member.
--
-- auth.users display_name is global (shared by every workspace the user is
-- in, edited only by the user). A nickname lets the member themself or a
-- workspace owner/admin set how that person is shown *in this workspace*
-- without touching their name anywhere else. NULL = no override; the UI
-- falls back to the global display_name, then email.
--
-- Writes go through the API (service role) which enforces who may edit, so
-- no RLS policy change is needed.

alter table public.workspace_members
  add column if not exists nickname text
  check (nickname is null or char_length(btrim(nickname)) between 1 and 50);

comment on column public.workspace_members.nickname is
  'Per-workspace display-name override. NULL = use the user''s global display_name.';
