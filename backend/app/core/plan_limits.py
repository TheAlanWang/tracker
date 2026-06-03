"""Subscription tier limits. Single source of truth for cap values.

Update here, not in routers/services. Stripe webhook will flip the
`workspaces.plan` column; this module is read-only config. Mirror in
frontend lives at `frontend/src/features/billing/planLimits.ts` —
keep both in sync when changing numbers.
"""

from typing import Literal

Plan = Literal["free", "pro"]


PLAN_LIMITS: dict[Plan, dict[str, int]] = {
    "free": {
        "members": 5,
        "emails_per_month": 100,
        "storage_gb": 1,
        "mcp_calls_per_day": 100,
        # In-app AI agent messages. Each turn the user sends to the AI panel
        # counts as one, regardless of how many tool calls it triggers — the
        # cost driver is the conversation, not the tool fan-out. Kept tight on
        # Free because every turn is real LLM spend the owner doesn't pay for;
        # this is the upgrade pressure point for the agent.
        "agent_messages_per_month": 10,
    },
    "pro": {
        # 50-member anti-abuse cap (not a "real" upgrade pressure point —
        # any Pro team hitting this should be on Enterprise, which is
        # deferred).
        "members": 50,
        "emails_per_month": 5_000,
        "storage_gb": 100,
        "mcp_calls_per_day": 10_000,  # effectively unlimited for v1
        # Pro allowance — comfortable for real use, low enough to cap
        # runaway/abusive automation cost (every turn is real LLM spend).
        "agent_messages_per_month": 500,
    },
}


def get_limit(plan: Plan, key: str) -> int:
    return PLAN_LIMITS[plan][key]
