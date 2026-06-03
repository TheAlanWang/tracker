"""Metered usage for the in-app AI agent.

One agent turn (one user message → one streamed reply, however many tool
calls it makes) counts as one against the workspace's monthly
`agent_messages_per_month` cap. The counter and atomic check-and-increment
live in the `agent_usage` table / `consume_agent_message` RPC; this module
is the service-layer wrapper that resolves the plan and maps an over-cap
result to a domain error.

Mirrors the member-cap gate in invitations.py: read plan → compare to the
cap from core/plan_limits.py.
"""

from dataclasses import dataclass

from supabase import AsyncClient

from app.core.plan_limits import Plan, get_limit

_CAP_KEY = "agent_messages_per_month"


class UsageError(Exception):
    pass


@dataclass
class AgentQuotaExceededError(UsageError):
    """Workspace has spent its monthly agent-message allowance."""

    plan: Plan
    cap: int
    used: int


@dataclass
class AgentUsage:
    plan: Plan
    cap: int
    used: int

    @property
    def remaining(self) -> int:
        return max(self.cap - self.used, 0)


async def _get_workspace_plan(supabase: AsyncClient, workspace_id: str) -> Plan:
    row = (
        await supabase.table("workspaces")
        .select("plan")
        .eq("id", workspace_id)
        .single()
        .execute()
    ).data
    return row["plan"] if row else "free"


async def get_agent_usage(
    supabase: AsyncClient, *, workspace_id: str
) -> AgentUsage:
    """Read-only current-month usage for the workspace (no increment)."""
    plan = await _get_workspace_plan(supabase, workspace_id)
    cap = get_limit(plan, _CAP_KEY)
    rows = (
        await supabase.table("agent_usage")
        .select("count")
        .eq("workspace_id", workspace_id)
        # `period_month` defaults to the current month on the DB side; the
        # RPC only ever upserts the current row, so the max count is the
        # current month's. Selecting all rows and taking the latest avoids
        # recomputing the month boundary here.
        .order("period_month", desc=True)
        .limit(1)
        .execute()
    ).data
    used = rows[0]["count"] if rows else 0
    return AgentUsage(plan=plan, cap=cap, used=used)


async def consume_agent_message(
    supabase: AsyncClient, *, workspace_id: str
) -> AgentUsage:
    """Atomically count one agent turn against the monthly cap.

    Raises AgentQuotaExceededError (→ 402 in the router) when the workspace
    is already at or over its allowance. Otherwise returns the post-increment
    usage so the caller can surface remaining quota.
    """
    plan = await _get_workspace_plan(supabase, workspace_id)
    cap = get_limit(plan, _CAP_KEY)
    result = (
        await supabase.rpc(
            "consume_agent_message",
            {"p_workspace_id": workspace_id, "p_limit": cap},
        ).execute()
    ).data
    # The RPC returns a single-row table: [{"allowed": bool, "used": int}].
    row = result[0] if result else {"allowed": False, "used": cap}
    if not row["allowed"]:
        raise AgentQuotaExceededError(plan=plan, cap=cap, used=row["used"])
    return AgentUsage(plan=plan, cap=cap, used=row["used"])
