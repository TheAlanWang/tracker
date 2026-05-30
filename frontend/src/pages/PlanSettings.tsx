import { useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { ProBadge } from "@/components/ProBadge";
import { useCreateCheckout, useBillingPortal } from "@/features/billing/api";
import {
  PLAN_LABEL,
  PLAN_LIMITS,
  PLAN_PRICE,
  type Plan,
} from "@/features/billing/planLimits";
import { useMembers } from "@/features/members/api";
import { useWorkspaceInvitations } from "@/features/invitations/api";
import { useWorkspaces, useWorkspaceUsage } from "@/features/workspaces/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

// The caps we surface in the Free-vs-Pro comparison, in display order.
const CAP_ROWS: { label: string; value: (p: Plan) => string }[] = [
  { label: "Members", value: (p) => `${PLAN_LIMITS[p].members}` },
  { label: "Storage", value: (p) => `${PLAN_LIMITS[p].storage_gb} GB` },
  {
    label: "MCP calls / day",
    value: (p) => PLAN_LIMITS[p].mcp_calls_per_day.toLocaleString(),
  },
  {
    label: "Emails / month",
    value: (p) => PLAN_LIMITS[p].emails_per_month.toLocaleString(),
  },
];

export default function PlanSettings() {
  useDocumentTitle("Plan");
  const { wsSlug } = useParams();
  const { data: workspaces = [] } = useWorkspaces();
  const { data: me } = useCurrentUser();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const wsId = currentWs?.id ?? "";

  const { data: members = [] } = useMembers(wsId);
  const { data: invitations = [] } = useWorkspaceInvitations(wsId);
  const { data: usage } = useWorkspaceUsage(wsId);
  const checkout = useCreateCheckout();
  const portal = useBillingPortal();
  const qc = useQueryClient();

  // Acknowledge the Stripe redirect (success_url / cancel_url carry ?billing=).
  // On success the webhook may lag a beat, so refetch workspaces to pick up Pro.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const result = params.get("billing");
    if (!result) return;
    if (result === "success") {
      toast.success("You're on Pro now — thanks!");
      qc.invalidateQueries({ queryKey: ["workspaces"] });
    } else if (result === "cancelled") {
      toast("Checkout cancelled — no charge was made.");
    }
    params.delete("billing");
    setParams(params, { replace: true });
    // Run once on the redirect; params/qc are stable enough for this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!currentWs) return null;

  const plan = currentWs.plan;
  const isOwner = !!me && currentWs.owner_id === me.id;

  // Live usage for the current plan's caps.
  const limits = PLAN_LIMITS[plan];
  const pendingCount = invitations.filter((i) => i.status === "pending").length;
  const usedSeats = members.length + pendingCount;
  const overBy = usedSeats - limits.members;
  const storageBytes = usage?.storage_bytes ?? null;

  async function startCheckout() {
    try {
      await checkout.mutateAsync(wsId);
    } catch (err) {
      toast.error(errDetail(err, "Couldn't start checkout"));
    }
  }
  async function openPortal() {
    try {
      await portal.mutateAsync(wsId);
    } catch (err) {
      toast.error(errDetail(err, "Couldn't open billing portal"));
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-neutral-100">
          Plan
        </h1>
        {plan === "pro" ? (
          <ProBadge size="md" />
        ) : (
          <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-neutral-800 px-3 py-1 text-xs font-medium uppercase tracking-wider text-slate-700 dark:text-neutral-300">
            {PLAN_LABEL[plan]}
          </span>
        )}
      </div>

      {/* Free vs Pro — what each tier costs and includes. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(["free", "pro"] as const).map((p) => {
          const isCurrent = p === plan;
          return (
            <div
              key={p}
              className={`rounded-xl border p-5 space-y-4 ${
                isCurrent
                  ? "border-[#C9A227] dark:border-[#E8C766] ring-1 ring-[#C9A227]/30"
                  : "border-slate-200 dark:border-neutral-800"
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-neutral-100">
                    {PLAN_LABEL[p]}
                  </h2>
                  {isCurrent && (
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-[#C9A227] dark:text-[#E8C766]">
                      Current
                    </span>
                  )}
                </div>
                <p className="text-slate-900 dark:text-neutral-100">
                  <span className="text-2xl font-semibold">
                    ${PLAN_PRICE[p].toFixed(2)}
                  </span>
                  <span className="text-sm text-slate-500 dark:text-neutral-400">
                    {" "}
                    / workspace / mo
                  </span>
                </p>
              </div>
              <ul className="space-y-1.5">
                {CAP_ROWS.map((row) => (
                  <li
                    key={row.label}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-slate-600 dark:text-neutral-400">
                      {row.label}
                    </span>
                    <span className="font-medium text-slate-900 dark:text-neutral-200 tabular-nums">
                      {row.value(p)}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Per-card CTA */}
              {p === "pro" && plan === "free" && (
                <Button
                  className="w-full"
                  disabled={!isOwner || checkout.isPending}
                  onClick={startCheckout}
                >
                  {checkout.isPending ? "Redirecting…" : "Upgrade to Pro"}
                </Button>
              )}
              {p === "pro" && plan === "pro" && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={!isOwner || portal.isPending}
                  onClick={openPortal}
                >
                  {portal.isPending ? "Opening…" : "Manage billing"}
                </Button>
              )}
              {p === "free" && plan === "pro" && isOwner && (
                <p className="text-xs text-slate-500 dark:text-neutral-400">
                  Downgrade from “Manage billing”.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {!isOwner && (
        <p className="text-xs text-slate-500 dark:text-neutral-400">
          Only the workspace owner can change the plan.
        </p>
      )}

      {/* Usage against the current plan's caps. */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400 mb-2">
          Usage
        </h2>
        <div className="rounded-lg border border-slate-200 dark:border-neutral-800 divide-y divide-slate-200 dark:divide-neutral-800">
          <UsageRow
            label="Members"
            used={String(usedSeats)}
            cap={String(limits.members)}
            isOver={overBy > 0}
            note={
              pendingCount > 0
                ? `${members.length} active + ${pendingCount} pending`
                : undefined
            }
            warning={
              overBy > 0
                ? `Over plan limit — remove ${overBy} member${overBy === 1 ? "" : "s"} to invite new ones.`
                : undefined
            }
          />
          <UsageRow
            label="Storage"
            used={storageBytes != null ? formatBytes(storageBytes) : "—"}
            cap={`${limits.storage_gb} GB`}
            isOver={
              storageBytes != null &&
              storageBytes > limits.storage_gb * 1024 * 1024 * 1024
            }
          />
          <UsageRow
            label="MCP calls today"
            used="—"
            cap={limits.mcp_calls_per_day.toLocaleString()}
          />
        </div>
      </div>
    </div>
  );
}

function errDetail(err: unknown, fallback: string): string {
  return (
    (err as { response?: { data?: { detail?: string } } }).response?.data
      ?.detail ?? fallback
  );
}

// Human-readable byte size. MB under 1 GB, else GB.
function formatBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
  const kb = bytes / 1024;
  return `${Math.max(0, Math.round(kb))} KB`;
}

// One row in the usage panel: `Label    used / cap`.
function UsageRow({
  label,
  used,
  cap,
  note,
  warning,
  isOver,
}: {
  label: string;
  used: string;
  cap: string;
  note?: string;
  warning?: string;
  isOver?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <div className="space-y-0.5">
        <p className="text-sm text-slate-700 dark:text-neutral-300">{label}</p>
        {note && (
          <p className="text-xs text-slate-500 dark:text-neutral-400">{note}</p>
        )}
        {warning && (
          <p className="text-xs text-red-700 dark:text-red-400">{warning}</p>
        )}
      </div>
      <p className="font-mono text-sm tabular-nums">
        <span
          className={
            isOver
              ? "font-medium text-red-700 dark:text-red-400"
              : "font-medium text-slate-900 dark:text-neutral-200"
          }
        >
          {used}
        </span>
        <span className="text-slate-400 dark:text-neutral-500"> / {cap}</span>
      </p>
    </div>
  );
}
