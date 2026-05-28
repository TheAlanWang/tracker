-- ─── transfer workspace ownership ───
-- Hand a workspace to another member atomically. Touches 3 rows across 2
-- tables: workspaces.owner_id, the new owner's member role (→ owner), and
-- the old owner's member role (→ admin). A half-applied transfer would
-- leave two owners or none, so it must run in one transaction.
--
-- SECURITY DEFINER: the FastAPI service layer verifies the caller IS the
-- current owner before invoking, so this function trusts the request and
-- only re-validates that the target is a member. Execute is locked to
-- service_role.
create or replace function transfer_workspace_ownership(
  p_workspace_id uuid,
  p_new_owner uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_owner uuid;
begin
  select owner_id into v_old_owner from workspaces where id = p_workspace_id;
  if v_old_owner is null then
    raise exception 'workspace not found: %', p_workspace_id
      using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from workspace_members
    where workspace_id = p_workspace_id and user_id = p_new_owner
  ) then
    raise exception 'new owner is not a member of this workspace'
      using errcode = 'P0002';
  end if;

  update workspaces set owner_id = p_new_owner where id = p_workspace_id;
  update workspace_members set role = 'owner'
    where workspace_id = p_workspace_id and user_id = p_new_owner;
  update workspace_members set role = 'admin'
    where workspace_id = p_workspace_id and user_id = v_old_owner;
end;
$$;

revoke execute on function transfer_workspace_ownership(uuid, uuid)
  from public, anon, authenticated;
