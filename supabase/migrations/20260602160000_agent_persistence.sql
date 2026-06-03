-- ─── AI agent persistence: conversation history + long-term memory ───
-- Two separate grains, deliberately:
--   * conversation history is per (project, user) — each board has its own
--     ongoing chat for that user.
--   * long-term memory is per (workspace, user) — durable facts/preferences
--     follow the user across projects WITHIN a workspace, but never cross the
--     workspace (tenant) boundary. Multi-tenant safety: a fact learned in one
--     team's workspace must not surface in another's.
--
-- The backend writes these with a service-role client (RLS-bypassing) but
-- enforces ownership + membership in the service layer; the RLS policies below
-- are defense-in-depth for any direct user-token access.

-- ── conversation history ──
create table agent_conversations (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  messages jsonb not null default '[]'::jsonb,  -- [{role, content}, ...]
  updated_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

alter table agent_conversations enable row level security;

create policy "own agent conversations"
  on agent_conversations for all
  using (user_id = auth.uid() and is_workspace_member(workspace_id))
  with check (user_id = auth.uid() and is_workspace_member(workspace_id));

-- ── long-term memory ──
create table agent_memory (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index agent_memory_ws_user_idx
  on agent_memory (workspace_id, user_id, created_at);

alter table agent_memory enable row level security;

create policy "own agent memory"
  on agent_memory for all
  using (user_id = auth.uid() and is_workspace_member(workspace_id))
  with check (user_id = auth.uid() and is_workspace_member(workspace_id));
