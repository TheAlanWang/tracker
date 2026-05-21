-- Workspace invitations. Joining a workspace now goes through an explicit
-- accept step instead of a direct workspace_members insert.
--
-- Lifecycle: pending → accepted / declined / revoked / expired.
-- A user may have at most one pending invitation per (workspace, email).
-- Accept inserts into workspace_members; decline/revoke just mark status.

create table workspace_invitations (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  invited_email text not null,
  invited_by uuid not null references auth.users(id) on delete cascade,
  role workspace_member_role not null default 'member',
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'revoked', 'expired')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days')
);

create index workspace_invitations_workspace_id_idx
  on workspace_invitations (workspace_id);

create index workspace_invitations_email_idx
  on workspace_invitations (lower(invited_email));

-- Only one pending invite per (workspace, email). Accept/decline/revoke
-- moves the row out of pending so a future invite can be issued.
create unique index workspace_invitations_pending_unique
  on workspace_invitations (workspace_id, lower(invited_email))
  where status = 'pending';

-- ─── RLS ───
alter table workspace_invitations enable row level security;

-- Members of the workspace (admins really, enforced at service layer) can
-- read invitations targeting their workspace.
create policy "workspace members can read invitations"
  on workspace_invitations for select
  using (is_workspace_member(workspace_id));

-- The invited user (matched on JWT email) can read their pending invitations
-- across any workspace.
create policy "invited user can read their invitations"
  on workspace_invitations for select
  using (
    lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- Service layer is the source of truth for who can mutate; keep insert
-- permissive for workspace admins/owners.
create policy "admins can insert invitations"
  on workspace_invitations for insert
  with check (
    exists (
      select 1 from workspace_members
      where workspace_id = workspace_invitations.workspace_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- Update: admins can revoke; invited user can accept/decline their own row.
create policy "admins update invitations in their workspace"
  on workspace_invitations for update
  using (
    exists (
      select 1 from workspace_members
      where workspace_id = workspace_invitations.workspace_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

create policy "invited user updates their invitation"
  on workspace_invitations for update
  using (
    lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  with check (
    lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
