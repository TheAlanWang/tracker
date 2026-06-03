-- ─── agent_usage ───
-- Per-workspace monthly counter for in-app AI agent messages. One row per
-- (workspace, calendar month); `count` is the number of agent turns the
-- workspace has spent this month. Drives the metered cap in
-- app/core/plan_limits.py ("agent_messages_per_month").
--
-- Mirrors the cap-based monetization model: not a feature gate, a usage
-- meter. Free workspaces get a small monthly allowance, Pro a generous one.

create table agent_usage (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  period_month date not null,          -- first day of the month (UTC)
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, period_month)
);

alter table agent_usage enable row level security;

-- Members can read their workspace's usage (the panel shows remaining
-- quota). Writes happen only through the SECURITY DEFINER RPC below, so
-- there is no insert/update policy — RLS denies direct mutation.
create policy "members can read agent usage"
  on agent_usage for select
  using (is_workspace_member(workspace_id));

-- ─── consume_agent_message ───
-- Atomic check-and-increment for one agent turn. Locks the month's row,
-- and increments only if the workspace is still under p_limit. Returns the
-- resulting usage so the caller can surface "X of N used".
--
--   allowed = false → over cap, count left unchanged (caller returns 402)
--   allowed = true  → count incremented by 1
--
-- SECURITY DEFINER so it can write agent_usage past RLS; the FastAPI
-- service validates workspace membership before calling, and execute is
-- locked to service_role below.
create or replace function consume_agent_message(
  p_workspace_id uuid,
  p_limit integer
)
returns table (allowed boolean, used integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', now() at time zone 'utc')::date;
  v_used integer;
begin
  insert into agent_usage (workspace_id, period_month, count)
  values (p_workspace_id, v_month, 0)
  on conflict (workspace_id, period_month) do nothing;

  select count into v_used
    from agent_usage
    where workspace_id = p_workspace_id and period_month = v_month
    for update;

  if v_used >= p_limit then
    return query select false, v_used;
  else
    update agent_usage
      set count = count + 1, updated_at = now()
      where workspace_id = p_workspace_id and period_month = v_month
      returning count into v_used;
    return query select true, v_used;
  end if;
end;
$$;

-- Backend (service_role) is the only intended caller; the frontend reaches
-- usage through the agent endpoint's quota events. Revoke from PUBLIC first,
-- then named roles, so anon / authenticated can't call it via any grant path.
revoke execute on function consume_agent_message(uuid, integer)
  from public, anon, authenticated;
