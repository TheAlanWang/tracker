// Mirror of backend/app/core/plan_limits.py.
// Keep in sync — backend is authoritative for enforcement; this copy
// exists so the UI can show "X / cap" without round-tripping for limit
// values that don't change at runtime.

export type Plan = "free" | "pro";

export const PLAN_LIMITS: Record<
  Plan,
  {
    members: number;
    emails_per_month: number;
    storage_gb: number;
    mcp_calls_per_day: number;
  }
> = {
  free: {
    members: 5,
    emails_per_month: 100,
    storage_gb: 1,
    mcp_calls_per_day: 100,
  },
  pro: {
    members: 50,
    emails_per_month: 5_000,
    storage_gb: 100,
    mcp_calls_per_day: 10_000,
  },
};

export const PLAN_LABEL: Record<Plan, string> = {
  free: "Free",
  pro: "Pro",
};

// Monthly price per workspace (USD), display-only. v1 is flat per workspace
// (not per-seat). Backend/Stripe is authoritative for what's actually charged.
export const PLAN_PRICE: Record<Plan, number> = {
  free: 0,
  pro: 4.99,
};
