import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  PLAN_LABEL,
  PLAN_LIMITS,
  PLAN_PRICE,
  type Plan,
} from "@/features/billing/planLimits";
import { useCreateCheckout, useBillingPortal } from "@/features/billing/api";
import { useMembers } from "@/features/members/api";
import { useWorkspaceInvitations } from "@/features/invitations/api";
import { useWorkspaces, useWorkspaceUsage } from "@/features/workspaces/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const GOLD = "#C9A227";

// What each tier includes, phrased as a benefits list (icon + text).
const CAP_LINES: ((p: Plan) => string)[] = [
  (p) => `${PLAN_LIMITS[p].members} members`,
  (p) => `${PLAN_LIMITS[p].storage_gb} GB storage`,
  (p) => `${PLAN_LIMITS[p].mcp_calls_per_day.toLocaleString()} MCP calls / day`,
  (p) => `${PLAN_LIMITS[p].emails_per_month.toLocaleString()} emails / month`,
];

export default function Billing() {
  useDocumentTitle("Billing");
  const { wsSlug } = useParams();
  const { data: workspaces = [] } = useWorkspaces();
  const { data: me } = useCurrentUser();

  // Defaults to the workspace in the URL; the in-page picker can switch which
  // workspace is billed without leaving the page.
  const urlWs = workspaces.find((w) => w.slug === wsSlug);
  const [pickedId, setPickedId] = useState("");
  const selectedWs = workspaces.find((w) => w.id === pickedId) ?? urlWs;
  const wsId = selectedWs?.id ?? "";

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
    const result = params.get("checkout");
    if (!result) return;
    if (result === "success") {
      toast.success("You're on Pro now — thanks!");
      qc.invalidateQueries({ queryKey: ["workspaces"] });
    } else if (result === "cancelled") {
      toast("Checkout cancelled — no charge was made.");
    }
    params.delete("checkout");
    setParams(params, { replace: true });
    // Run once on the redirect; params/qc are stable enough for this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!selectedWs) return null;

  const plan = selectedWs.plan;
  const isOwner = !!me && selectedWs.owner_id === me.id;

  // Live usage for the current plan's caps.
  const limits = PLAN_LIMITS[plan];
  const pendingCount = invitations.filter((i) => i.status === "pending").length;
  const usedSeats = members.length + pendingCount;
  const overBy = usedSeats - limits.members;
  const storageBytes = usage?.storage_bytes ?? null;
  const storageCapBytes = limits.storage_gb * 1024 * 1024 * 1024;

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
    <div className="max-w-3xl mx-auto space-y-10">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-neutral-100">
            Billing
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-neutral-400">
            Plan &amp; usage for this workspace.
          </p>
        </div>
        {/* Workspace context — billing acts on this one. Frameless switcher
            when there are several; plain text when there's only one. */}
        <div className="flex shrink-0 items-center gap-1.5 text-sm">
          <span className="text-slate-500 dark:text-neutral-400">Workspace:</span>
          {workspaces.length > 1 ? (
            <Select
              value={selectedWs.id}
              onChange={setPickedId}
              options={workspaces.map((w) => ({ value: w.id, label: w.name }))}
              className="w-44"
              triggerClassName="border-0 bg-transparent px-1.5 font-medium text-slate-900 dark:text-neutral-100 hover:bg-slate-100 dark:hover:bg-neutral-800 focus:ring-0"
            />
          ) : (
            <span className="font-medium text-slate-900 dark:text-neutral-100">
              {selectedWs.name}
            </span>
          )}
        </div>
      </div>

      {/* Clear "you're on Pro" confirmation + the manage/cancel entry point. */}
      {plan === "pro" && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#C9A227]/40 bg-[#C9A227]/[0.06] p-5">
          <div className="flex items-center gap-3">
            <span className="text-xl leading-none" style={{ color: GOLD }}>
              ✦
            </span>
            <div>
              <p className="font-semibold text-slate-900 dark:text-neutral-100">
                You’re on Pro
              </p>
              <p className="text-sm text-slate-500 dark:text-neutral-400">
                ${PLAN_PRICE.pro.toFixed(2)} / workspace / mo · billed monthly
              </p>
            </div>
          </div>
          {isOwner && (
            <Button
              variant="outline"
              className="shrink-0"
              disabled={portal.isPending}
              onClick={openPortal}
            >
              {portal.isPending ? "Opening…" : "Manage billing"}
            </Button>
          )}
        </div>
      )}

      {/* Free vs Pro — what each tier costs and includes. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-stretch">
        {(["free", "pro"] as const).map((p) => {
          const isCurrent = p === plan;
          const isUpsell = p === "pro" && plan === "free";
          const cardClass = isCurrent
            ? "border-[#C9A227]/70 ring-1 ring-[#C9A227]/25 bg-white dark:bg-neutral-900"
            : isUpsell
              ? "border-blue-200 dark:border-blue-500/30 bg-blue-50/50 dark:bg-blue-500/[0.06]"
              : "border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900";
          return (
            <div
              key={p}
              className={`flex flex-col rounded-2xl border p-6 shadow-sm ${cardClass}`}
            >
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900 dark:text-neutral-100">
                  {PLAN_LABEL[p]}
                </h2>
                {isCurrent ? (
                  <span
                    className="text-[10px] uppercase tracking-wider font-semibold"
                    style={{ color: GOLD }}
                  >
                    Current
                  </span>
                ) : (
                  isUpsell && (
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-blue-600 dark:text-blue-400">
                      Recommended
                    </span>
                  )
                )}
              </div>

              <p className="mt-2 text-slate-900 dark:text-neutral-100">
                <span className="text-3xl font-semibold tracking-tight">
                  ${PLAN_PRICE[p].toFixed(2)}
                </span>
                <span className="text-sm text-slate-500 dark:text-neutral-400">
                  {" "}
                  / workspace / mo
                </span>
              </p>

              <ul className="mt-5 space-y-2.5">
                {CAP_LINES.map((line, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-neutral-300"
                  >
                    <Check
                      className={`w-4 h-4 shrink-0 ${
                        isUpsell
                          ? "text-blue-500 dark:text-blue-400"
                          : "text-slate-400 dark:text-neutral-500"
                      }`}
                      strokeWidth={2.5}
                    />
                    <span>{line(p)}</span>
                  </li>
                ))}
              </ul>

              {/* Upgrade CTA, pinned to the bottom so the cards align. Manage /
                  cancel lives in the Pro banner above when already subscribed. */}
              {p === "pro" && plan === "free" && (
                <div className="mt-auto pt-6">
                  <Button
                    className="w-full"
                    disabled={!isOwner || checkout.isPending}
                    onClick={startCheckout}
                  >
                    {checkout.isPending ? "Redirecting…" : "Upgrade to Pro"}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!isOwner && (
        <p className="-mt-6 text-xs text-slate-500 dark:text-neutral-400">
          Only the workspace owner can change the plan.
        </p>
      )}

      {/* Usage against the current plan's caps. */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
          Usage
        </h2>
        <div className="rounded-xl border border-slate-200 dark:border-neutral-800 divide-y divide-slate-100 dark:divide-neutral-800">
          <UsageRow
            label="Members"
            used={String(usedSeats)}
            cap={String(limits.members)}
            fraction={usedSeats / limits.members}
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
            fraction={storageBytes != null ? storageBytes / storageCapBytes : undefined}
            isOver={storageBytes != null && storageBytes > storageCapBytes}
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

// One row in the usage panel: label, used / cap, and (when a fraction is
// given) a thin progress bar — neutral, gold near the cap, red over it.
function UsageRow({
  label,
  used,
  cap,
  note,
  warning,
  isOver,
  fraction,
}: {
  label: string;
  used: string;
  cap: string;
  note?: string;
  warning?: string;
  isOver?: boolean;
  fraction?: number;
}) {
  const barColor = isOver
    ? "#dc2626"
    : fraction != null && fraction >= 0.8
      ? GOLD
      : "#94a3b8";
  return (
    <div className="px-5 py-3.5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-700 dark:text-neutral-300">{label}</p>
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
      {fraction != null && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-neutral-800">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, Math.max(2, fraction * 100))}%`,
              backgroundColor: barColor,
            }}
          />
        </div>
      )}
      {note && (
        <p className="mt-1 text-xs text-slate-500 dark:text-neutral-400">{note}</p>
      )}
      {warning && (
        <p className="mt-1 text-xs text-red-700 dark:text-red-400">{warning}</p>
      )}
    </div>
  );
}
