// Workspace Dashboard page.
//
// Layout (top → bottom):
//   - Hero greeting ("Good morning, Alan.") with a dynamic subtitle that
//     reflects today's state ("3 overdue, 2 due today" / "All caught up").
//   - Stat Bento: clickable Workload (hero, blue) + Done this week (emerald)
//     + Overdue (amber). Clicking a tile expands an inline panel with the
//     underlying task list. All three stats are filtered server-side to the
//     current user, which is why the panel skips an "Assigned" column.
//   - Today's Focus: top 3 priorities (overdue → due today → assigned filler).
//     Hidden when the Workload panel is expanded, since the list duplicates.
//   - Two-column body: Due this week + Active sprints on the left, Recent
//     activity feed on the right with a Show more toggle.
//
// All task data comes from /me/dashboard (services/dashboard.py). Rows in
// the panel + Due this week share a TaskTable component (HTML <table>,
// table-layout: auto — CSS Grid versions kept misbehaving for our use case).
// Project chips inside rows navigate to that project's Board on click;
// stopPropagation prevents the row's onClick (open task detail) from firing.

import { CircleAlert } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Avatar } from "@/components/Avatar";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { isOverdueDate, isTodayDate, parseDueDate } from "@/lib/date";
import {
  type DashboardActivity,
  type DashboardSprint,
  type DashboardStats,
  type DashboardTask,
  useDashboard,
} from "@/features/dashboard/api";
import { StatusPill } from "@/components/StatusPill";
import { type TaskStatus } from "@/features/tasks/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { isSprintsEnabled, useWorkspaces } from "@/features/workspaces/api";

const FIELD_LABEL: Record<string, string> = {
  title: "title",
  description: "description",
  status: "status",
  priority: "priority",
  assignee_id: "assignee",
  sprint_id: "sprint",
  due_date: "due date",
  archived_at: "archive",
};

// Renders activity-log field names (status / assignee / etc.) as small
// uppercase tokens so changed fields read like tags inside the sentence.
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="uppercase tracking-wide text-[10.5px] font-medium text-slate-600 dark:text-neutral-400">
      {children}
    </span>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function timeBucket(iso: string): "today" | "yesterday" | "week" | "earlier" {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor(
    (today.getTime() - d.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return "week";
  return "earlier";
}

// ---- Hero ----

function greetingFor(name: string | null): { hi: string; sub: string } {
  const hour = new Date().getHours();
  const slot =
    hour < 5
      ? "Working late"
      : hour < 12
        ? "Good morning"
        : hour < 17
          ? "Good afternoon"
          : "Good evening";
  return { hi: `${slot}${name ? `, ${name.split(" ")[0]}` : ""}.`, sub: "" };
}

function focusSubtitle(
  overdueCount: number,
  dueTodayCount: number,
  assignedCount: number,
): string {
  if (overdueCount > 0 && dueTodayCount > 0) {
    return `${overdueCount} overdue, ${dueTodayCount} due today.`;
  }
  if (overdueCount > 0) {
    return `${overdueCount} task${overdueCount > 1 ? "s" : ""} overdue.`;
  }
  if (dueTodayCount > 0) {
    return `${dueTodayCount} task${dueTodayCount > 1 ? "s" : ""} due today.`;
  }
  if (assignedCount > 0) {
    return `${assignedCount} open task${assignedCount > 1 ? "s" : ""} on your plate.`;
  }
  return "You're all caught up — nice.";
}

// ---- Stat bento ----

type ExpandKey = "workload" | "done" | "overdue";

function Chevron({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`w-3.5 h-3.5 text-slate-400 dark:text-neutral-500 transition-transform ${active ? "rotate-180" : ""}`}
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// Bento: Workload (hero, spans 2 cols) + Done this week + Overdue. "In review"
// is a sub-line inside Workload because it's a subset of Open — surfacing it
// as an equal tile was redundant. Each tile is clickable to drill into the
// underlying task list inline below the grid.
function WorkloadHero({
  stats,
  active,
  onClick,
}: {
  stats: DashboardStats;
  active: boolean;
  onClick: () => void;
}) {
  // Workload is the page's primary KPI. All three stat cards now share one
  // neutral card style (equal width); only the small icon chip carries an
  // accent colour, so they read as a consistent set.
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border bg-white dark:bg-neutral-900 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)] ${
        active
          ? "border-blue-400 dark:border-blue-700 ring-2 ring-blue-100 dark:ring-blue-900/40"
          : "border-blue-100 dark:border-transparent ring-1 ring-blue-50/60 dark:ring-0"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500 dark:text-neutral-400 font-semibold flex items-center gap-1.5">
            Workload <Chevron active={active} />
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-4xl font-bold leading-none tabular-nums text-slate-900 dark:text-neutral-200">
              {stats.open}
            </span>
            <span className="text-sm font-medium text-slate-500 dark:text-neutral-400">open</span>
          </div>
          {stats.in_review > 0 && (
            <p className="mt-2 text-sm text-slate-500 dark:text-neutral-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                <span className="tabular-nums font-medium text-slate-700 dark:text-neutral-300">
                  {stats.in_review}
                </span>{" "}
                in review
              </span>
            </p>
          )}
        </div>
        <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path
              fillRule="evenodd"
              d="M3.5 5A1.5 1.5 0 0 1 5 3.5h10A1.5 1.5 0 0 1 16.5 5v10a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 15V5Z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </div>
    </button>
  );
}

function ThroughputTile({
  value,
  active,
  onClick,
}: {
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  const accent = value > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border bg-white dark:bg-neutral-900 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)] ${
        active
          ? "border-emerald-400 dark:border-emerald-700 ring-2 ring-emerald-100 dark:ring-emerald-900/40"
          : accent
            ? "border-emerald-100 dark:border-transparent ring-1 ring-emerald-50 dark:ring-0"
            : "border-slate-200/80 dark:border-transparent"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500 dark:text-neutral-400 font-semibold flex items-center gap-1.5">
            Done this week <Chevron active={active} />
          </p>
          <p
            className={`mt-2 text-4xl font-bold leading-none tabular-nums ${accent ? "text-emerald-700" : "text-slate-900 dark:text-neutral-200"}`}
          >
            {value}
          </p>
        </div>
        <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path
              fillRule="evenodd"
              d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.59l7.3-7.3a1 1 0 0 1 1.4 0Z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </div>
    </button>
  );
}

function RiskTile({
  value,
  active,
  onClick,
}: {
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  // Amber (not red) icon chip — overdue is "needs attention," not "error."
  const accent = value > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border bg-white dark:bg-neutral-900 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)] ${
        active
          ? "border-amber-400 dark:border-amber-700 ring-2 ring-amber-100 dark:ring-amber-900/40"
          : accent
            ? "border-amber-100 dark:border-transparent ring-1 ring-amber-50 dark:ring-0"
            : "border-slate-200/80 dark:border-transparent"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500 dark:text-neutral-400 font-semibold flex items-center gap-1.5">
            Overdue <Chevron active={active} />
          </p>
          <p
            className={`mt-2 text-4xl font-bold leading-none tabular-nums ${accent ? "text-amber-700" : "text-slate-900 dark:text-neutral-200"}`}
          >
            {value}
          </p>
        </div>
        <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
          <CircleAlert className="w-4 h-4" strokeWidth={2.25} />
        </div>
      </div>
    </button>
  );
}

function StatsRow({
  stats,
  expanded,
  onToggle,
}: {
  stats: DashboardStats;
  expanded: ExpandKey | null;
  onToggle: (key: ExpandKey) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <WorkloadHero
        stats={stats}
        active={expanded === "workload"}
        onClick={() => onToggle("workload")}
      />
      <ThroughputTile
        value={stats.done_this_week}
        active={expanded === "done"}
        onClick={() => onToggle("done")}
      />
      <RiskTile
        value={stats.overdue}
        active={expanded === "overdue"}
        onClick={() => onToggle("overdue")}
      />
    </div>
  );
}

// Inline panel rendered directly below the stats grid, showing the task list
// behind whichever tile is currently active.
// AnimatedExpansion — wraps ExpansionPanel with a smooth open/close
// animation. Three things happen in parallel over 280ms:
//   1. Outer grid animates grid-template-rows 0fr ↔ 1fr (height auto, no JS)
//   2. Inner content fades opacity 0 ↔ 100
//   3. Inner content slides up/down 4px (subtle motion cue)
//
// During close, we keep the previous expandKey rendered for `MS` after
// `open` flips false so the panel doesn't blank to empty content mid-
// animation. After the duration, we drop it.
function AnimatedExpansion({
  open,
  renderKey,
  workload,
  done,
  overdue,
  onClose,
  onOpenTask,
}: {
  open: boolean;
  renderKey: ExpandKey | null;
  workload: DashboardTask[];
  done: DashboardTask[];
  overdue: DashboardTask[];
  onClose: () => void;
  onOpenTask: (id: string) => void;
}) {
  const MS = 280;
  // Track the key used for rendering. When closing, we hold the last
  // key for MS milliseconds so ExpansionPanel can finish its exit.
  const [stickyKey, setStickyKey] = useState<ExpandKey | null>(renderKey);

  useEffect(() => {
    if (renderKey) {
      setStickyKey(renderKey);
      return;
    }
    const t = window.setTimeout(() => setStickyKey(null), MS);
    return () => window.clearTimeout(t);
  }, [renderKey]);

  return (
    <div
      // grid-rows trick — animates the row size between 0fr (collapsed)
      // and 1fr (auto, matching child's natural height). Pure CSS, no
      // JS measurement, no layout glitches.
      className={`grid transition-[grid-template-rows,opacity] duration-[280ms] ease-[cubic-bezier(0.2,0,0,1)] ${
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      }`}
      aria-hidden={!open}
    >
      <div className="overflow-hidden">
        <div
          className={`transition-transform duration-[280ms] ease-[cubic-bezier(0.2,0,0,1)] ${
            open ? "translate-y-0" : "-translate-y-1"
          }`}
        >
          {stickyKey && (
            <ExpansionPanel
              expanded={stickyKey}
              workload={workload}
              done={done}
              overdue={overdue}
              onClose={onClose}
              onOpenTask={onOpenTask}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ExpansionPanel({
  expanded,
  workload,
  done,
  overdue,
  onClose,
  onOpenTask,
}: {
  expanded: ExpandKey;
  workload: DashboardTask[];
  done: DashboardTask[];
  overdue: DashboardTask[];
  onClose: () => void;
  onOpenTask: (id: string) => void;
}) {
  const cfg = {
    workload: {
      title: "Workload — your open tasks",
      empty: "No open tasks. Enjoy the quiet.",
      tasks: workload,
    },
    done: {
      title: "Done this week",
      empty: "Nothing finished in the last 7 days yet.",
      tasks: done,
    },
    overdue: {
      title: "Overdue",
      empty: "Nothing overdue — nice.",
      tasks: overdue,
    },
  }[expanded];

  return (
    <section className="rounded-xl border border-slate-200/80 dark:border-transparent bg-white dark:bg-neutral-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-neutral-800">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-neutral-400">
          {cfg.title}
          {cfg.tasks.length > 0 && (
            <span className="ml-1.5 text-slate-400 dark:text-neutral-500 normal-case tracking-normal tabular-nums">
              {cfg.tasks.length}
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="w-6 h-6 rounded-md text-slate-400 dark:text-neutral-500 hover:text-slate-700 dark:hover:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 flex items-center justify-center"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path
              fillRule="evenodd"
              d="M4.3 4.3a1 1 0 0 1 1.4 0L10 8.6l4.3-4.3a1 1 0 1 1 1.4 1.4L11.4 10l4.3 4.3a1 1 0 1 1-1.4 1.4L10 11.4l-4.3 4.3a1 1 0 1 1-1.4-1.4L8.6 10 4.3 5.7a1 1 0 0 1 0-1.4Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
      <div className="p-2">
        {cfg.tasks.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-neutral-500 px-3 py-2">{cfg.empty}</p>
        ) : (
          <TaskTable tasks={cfg.tasks} onOpenTask={onOpenTask} />
        )}
      </div>
    </section>
  );
}

// ---- Focus card ----

type FocusReason = "overdue" | "today" | "assigned";

function pickFocus(
  overdue: DashboardTask[],
  dueThisWeek: DashboardTask[],
  assigned: DashboardTask[],
): { task: DashboardTask; reason: FocusReason }[] {
  const seen = new Set<string>();
  const picks: { task: DashboardTask; reason: FocusReason }[] = [];

  const sortedOverdue = [...overdue].sort((a, b) => {
    const ad = a.due_date ? parseDueDate(a.due_date).getTime() : Infinity;
    const bd = b.due_date ? parseDueDate(b.due_date).getTime() : Infinity;
    return ad - bd; // most overdue first
  });
  for (const t of sortedOverdue) {
    if (picks.length >= 3) break;
    if (seen.has(t.id)) continue;
    picks.push({ task: t, reason: "overdue" });
    seen.add(t.id);
  }

  const dueToday = dueThisWeek.filter((t) => t.due_date && isTodayDate(t.due_date));
  for (const t of dueToday) {
    if (picks.length >= 3) break;
    if (seen.has(t.id)) continue;
    picks.push({ task: t, reason: "today" });
    seen.add(t.id);
  }

  for (const t of assigned) {
    if (picks.length >= 3) break;
    if (seen.has(t.id)) continue;
    picks.push({ task: t, reason: "assigned" });
    seen.add(t.id);
  }

  return picks;
}

function FocusCard({
  picks,
  onOpen,
}: {
  picks: { task: DashboardTask; reason: FocusReason }[];
  onOpen: (id: string) => void;
}) {
  // Rank color signals urgency tier: red = overdue, amber = today, slate
  // = plain assigned (filler when nothing urgent).
  const rankColor = (reason: FocusReason) =>
    reason === "overdue"
      ? "text-red-600"
      : reason === "today"
        ? "text-amber-600"
        : "text-slate-400 dark:text-neutral-500";

  // Use a real <table> like TaskTable. See the comment on TaskTable for the
  // "why not Grid" backstory.

  return (
    <section className="rounded-xl border border-slate-200/80 dark:border-transparent bg-white dark:bg-neutral-900 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-neutral-400">
          Today's focus
        </h2>
        <span className="text-[11px] text-slate-400 dark:text-neutral-500">
          Top {picks.length} priorit{picks.length === 1 ? "y" : "ies"}
        </span>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-neutral-500">
            <th className="px-3 pb-2 text-left w-6" />
            <th className="px-3 pb-2 text-left">Project</th>
            <th className="px-3 pb-2 text-left">Task</th>
            <th className="px-3 pb-2 text-left whitespace-nowrap">Due</th>
            <th className="px-3 pb-2 text-left">Status</th>
          </tr>
        </thead>
        <tbody>
          {picks.map(({ task, reason }, i) => {
            const dueLabel = task.due_date
              ? parseDueDate(task.due_date).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })
              : null;
            const isOverdue =
              !!task.due_date && isOverdueDate(task.due_date);

            return (
              <tr
                key={task.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpen(task.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen(task.id);
                  }
                }}
                className="group border-t border-slate-100 dark:border-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-800/50 transition-colors cursor-pointer"
              >
                <td className="px-3 py-2.5 align-middle">
                  <span
                    className={`text-xs font-bold tabular-nums ${rankColor(reason)}`}
                    title={
                      reason === "overdue"
                        ? "Overdue"
                        : reason === "today"
                          ? "Due today"
                          : "Assigned"
                    }
                  >
                    {i + 1}
                  </span>
                </td>
                <td className="px-3 py-2.5 align-middle">
                  <ProjectChip
                    workspaceSlug={task.workspace_slug}
                    projectKey={task.project_key}
                    projectName={task.project_name}
                  />
                </td>
                <td className="px-3 py-2.5 align-middle text-sm text-slate-800 dark:text-neutral-200 group-hover:text-slate-900">
                  {task.title}
                </td>
                <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                  {dueLabel ? (
                    <span
                      className={`text-xs ${
                        isOverdue ? "text-red-600 font-medium" : "text-slate-500 dark:text-neutral-400"
                      }`}
                    >
                      {dueLabel}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 align-middle">
                  <StatusPill status={task.status as TaskStatus} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// ---- Section card (generic) ----

function SectionCard({
  title,
  count,
  children,
  rightSlot,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  rightSlot?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200/80 dark:border-transparent bg-white dark:bg-neutral-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-neutral-800">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-neutral-400">
          {title}
          {typeof count === "number" && (
            <span className="ml-1.5 text-slate-400 dark:text-neutral-500 normal-case tracking-normal tabular-nums">
              {count}
            </span>
          )}
        </h2>
        {rightSlot}
      </div>
      <div className="p-2">{children}</div>
    </section>
  );
}

// ---- Task / sprint / activity rows ----

// Small clickable chip that surfaces the parent project and jumps to its
// Board. Used inside dashboard rows that otherwise open the task detail
// modal — the chip stops propagation so the two affordances don't collide.
// Stable per-project color, hashed from the project key. Same hash function as
// the sidebar so the dot/swatch colors match across the app.
function projectHue(key: string): number {
  return Array.from(key).reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
}

function ProjectChip({
  workspaceSlug,
  projectKey,
  projectName,
}: {
  workspaceSlug: string;
  projectKey: string;
  projectName: string;
}) {
  const navigate = useNavigate();
  const hue = projectHue(projectKey);
  return (
    <button
      type="button"
      title={`Go to ${projectName} board`}
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/w/${workspaceSlug}/p/${projectKey}/board`);
      }}
      className="inline-flex items-center gap-1.5 text-sm rounded px-1.5 py-0.5 -mx-1.5 hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-neutral-100 transition-colors shrink-0 max-w-[12rem]"
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: `hsl(${hue} 55% 55%)` }}
      />
      <span className="truncate">{projectName}</span>
    </button>
  );
}

// We use an HTML <table> here, same as the project's List view, because the
// browser's `table-layout: auto` algorithm sizes each column based on widest
// content + distributes leftover width proportionally — exactly the "balanced
// row" look we want on the dashboard. CSS Grid with minmax/fit-content kept
// fighting us: either columns blew up to their max (gaps in the middle) or
// hugged left (right side empty). Tables get this right for free.
//
// Assigned was dropped — every dashboard task is `assignee = current user`
// already (backend filter), so the column was pure redundancy.
function TaskTable({
  tasks,
  onOpenTask,
}: {
  tasks: DashboardTask[];
  onOpenTask: (id: string) => void;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-neutral-500">
          <th className="px-3 pb-2 text-left">Project</th>
          <th className="px-3 pb-2 text-left">Task</th>
          <th className="px-3 pb-2 text-left whitespace-nowrap">Due</th>
          <th className="px-3 pb-2 text-left">Status</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((t, i) => (
          <TaskRow
            key={t.id}
            task={t}
            index={i}
            onClick={() => onOpenTask(t.id)}
          />
        ))}
      </tbody>
    </table>
  );
}

function TaskRow({
  task,
  index = 0,
  onClick,
}: {
  task: DashboardTask;
  // 0-based row index. Drives a small stagger so each row fades in just
  // after the one above it — gives the table a "cascading reveal" feel
  // when the panel opens. Capped at 8 so very long lists don't drag.
  index?: number;
  onClick: () => void;
}) {
  const dueLabel = task.due_date
    ? parseDueDate(task.due_date).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;
  const isOverdue = !!task.due_date && isOverdueDate(task.due_date);
  const delay = Math.min(index, 8) * 25;
  return (
    <tr
      role="button"
      tabIndex={0}
      style={{ animationDelay: `${delay}ms` }}
      className="group border-t border-slate-100 dark:border-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-800/50 transition-colors cursor-pointer animate-in fade-in slide-in-from-top-1 fill-mode-both duration-200"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <td className="px-3 py-2 align-middle">
        <ProjectChip
          workspaceSlug={task.workspace_slug}
          projectKey={task.project_key}
          projectName={task.project_name}
        />
      </td>
      <td className="px-3 py-2 align-middle text-slate-800 dark:text-neutral-200 group-hover:text-slate-900">
        {task.title}
      </td>
      <td className="px-3 py-2 align-middle whitespace-nowrap">
        {dueLabel ? (
          <span
            className={`text-xs ${
              isOverdue ? "text-red-600 font-medium" : "text-slate-500 dark:text-neutral-400"
            }`}
          >
            {dueLabel}
          </span>
        ) : (
          <span className="text-xs text-slate-300">—</span>
        )}
      </td>
      <td className="px-3 py-2 align-middle">
        <StatusPill status={task.status as TaskStatus} />
      </td>
    </tr>
  );
}

function SprintRow({
  sprint,
  onClick,
}: {
  sprint: DashboardSprint;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="w-full text-left flex items-center gap-3 px-3 py-2 rounded hover:bg-slate-50 dark:hover:bg-neutral-800/50 text-sm"
      onClick={onClick}
    >
      <span className="flex-1 truncate font-medium text-slate-800 dark:text-neutral-200">
        {sprint.name}
      </span>
      <span className="text-xs text-slate-400 dark:text-neutral-500 shrink-0">
        {sprint.workspace_slug} / {sprint.project_key}
      </span>
      {sprint.end_at && (
        <span className="text-xs text-slate-500 dark:text-neutral-400 shrink-0">
          ends{" "}
          {new Date(sprint.end_at).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </span>
      )}
    </button>
  );
}

function formatActivityAction(a: DashboardActivity): React.ReactNode {
  const p = a.payload as Record<
    string,
    { from?: unknown; to?: unknown; updated?: boolean }
  >;
  switch (a.action) {
    case "created":
      return <>created</>;
    case "commented":
      return <>commented on</>;
    case "updated": {
      const fields = Object.keys(p);
      if (fields.length === 0) return <>edited</>;
      if (fields.length === 1) {
        const f = fields[0];
        const label = FIELD_LABEL[f] ?? f;
        const c = p[f];
        // Archive toggle reads as a verb on the cross-task feed
        // ("archived FRO-23" vs "changed ARCHIVE of FRO-23").
        if (f === "archived_at") {
          return <>{c.to ? "archived" : "unarchived"}</>;
        }
        if (c.updated) return <>updated <FieldLabel>{label}</FieldLabel> of</>;
        return <>changed <FieldLabel>{label}</FieldLabel> of</>;
      }
      return (
        <>
          updated{" "}
          {fields.map((f, i) => (
            <Fragment key={f}>
              {i > 0 && ", "}
              <FieldLabel>{FIELD_LABEL[f] ?? f}</FieldLabel>
            </Fragment>
          ))}{" "}
          of
        </>
      );
    }
    default:
      return <>{a.action.replace(/_/g, " ")}</>;
  }
}

function ActivityRow({
  a,
  onClick,
}: {
  a: DashboardActivity;
  onClick: () => void;
}) {
  // Prefer a display name over the raw email — name reads more naturally in
  // activity sentences and as the avatar initial.
  const actor = a.actor_display_name?.trim() || a.actor_email || "Someone";
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded hover:bg-slate-50 dark:hover:bg-neutral-800/50"
    >
      <Avatar
        displayName={a.actor_display_name}
        email={a.actor_email}
        avatarUrl={a.actor_avatar_url}
        color={a.actor_avatar_color}
        size={22}
        className="ring-0"
      />
      {/* Single-line sentence — the avatar carries the visual weight,
          so the name itself can sit at the same weight as the verb.
          Task title gets darker (slate-700) since that's what the user
          actually cares about scanning for. */}
      <p className="flex-1 min-w-0 truncate text-xs text-slate-500 dark:text-neutral-400">
        <span className="text-slate-700 dark:text-neutral-300">{actor}</span>
        <span className="ml-1">{formatActivityAction(a)} </span>
        <span className="font-mono text-[11px] px-1 py-0.5 rounded bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400 mx-0.5">
          {a.task_identifier}
        </span>
        <span className="text-slate-700 dark:text-neutral-300"> {a.task_title}</span>
      </p>
      <span className="text-xs text-slate-400 dark:text-neutral-500 shrink-0">
        {formatRelative(a.created_at)}
      </span>
    </button>
  );
}

const ACTIVITY_PREVIEW = 6;

function ActivityFeed({
  items,
  onOpen,
}: {
  items: DashboardActivity[];
  onOpen: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = items.length > ACTIVITY_PREVIEW;

  return (
    <>
      {expanded ? (
        <GroupedActivity items={items} onOpen={onOpen} />
      ) : (
        <div className="space-y-0.5">
          {items.slice(0, ACTIVITY_PREVIEW).map((a) => (
            <ActivityRow key={a.id} a={a} onClick={() => onOpen(a.task_id)} />
          ))}
        </div>
      )}
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 ml-1 text-xs text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-100 px-2 py-1"
        >
          {expanded
            ? "Show less"
            : `Show ${items.length - ACTIVITY_PREVIEW} more activity →`}
        </button>
      )}
    </>
  );
}

function GroupedActivity({
  items,
  onOpen,
}: {
  items: DashboardActivity[];
  onOpen: (id: string) => void;
}) {
  const groups = useMemo(() => {
    const map: Record<
      "today" | "yesterday" | "week" | "earlier",
      DashboardActivity[]
    > = {
      today: [],
      yesterday: [],
      week: [],
      earlier: [],
    };
    for (const a of items) map[timeBucket(a.created_at)].push(a);
    return map;
  }, [items]);

  const labels = {
    today: "Today",
    yesterday: "Yesterday",
    week: "This week",
    earlier: "Earlier",
  } as const;

  return (
    <div className="space-y-3">
      {(["today", "yesterday", "week", "earlier"] as const).map((k) => {
        const arr = groups[k];
        if (arr.length === 0) return null;
        return (
          <div key={k}>
            <p className="px-3 pt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-neutral-500">
              {labels[k]}
            </p>
            <div className="space-y-0.5 mt-1">
              {arr.map((a) => (
                <ActivityRow key={a.id} a={a} onClick={() => onOpen(a.task_id)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Page ----

// Placeholder shown while /me/dashboard is in flight. Mirrors the real
// page's structure so the layout doesn't reflow when content lands —
// the eye stays put and the page feels immediately responsive.
function DashboardSkeleton() {
  return (
    <div className="space-y-6 max-w-7xl">
      <div className="space-y-2">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Skeleton className="h-28 rounded-xl sm:col-span-2" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
      <Skeleton className="h-56 rounded-xl" />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-3">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  useDocumentTitle("Dashboard");
  const navigate = useNavigate();
  const { wsSlug } = useParams();
  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const sprintsEnabled = isSprintsEnabled(currentWs);
  const { data: me } = useCurrentUser();
  const { data, isLoading } = useDashboard(currentWs?.id);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ExpandKey | null>(null);
  const toggleExpand = (key: ExpandKey) =>
    setExpanded((cur) => (cur === key ? null : key));

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const stats = data?.stats ?? {
    open: 0,
    done_this_week: 0,
    overdue: 0,
    in_review: 0,
  };
  const assigned = data?.assigned_to_me ?? [];
  const dueThisWeek = data?.due_this_week ?? [];
  const overdue = data?.overdue ?? [];
  const doneThisWeek = data?.done_this_week_tasks ?? [];
  const activeSprints = data?.active_sprints ?? [];
  const recentActivity = data?.recent_activity ?? [];

  const dueTodayCount = dueThisWeek.filter(
    (t) => t.due_date && isTodayDate(t.due_date),
  ).length;

  const focusPicks = pickFocus(overdue, dueThisWeek, assigned);
  const { hi } = greetingFor(me?.display_name ?? null);
  const subtitle = focusSubtitle(
    overdue.length,
    dueTodayCount,
    assigned.length,
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        {/* Two-line hero: personalized greeting + actionable subtitle. The
            workspace name lives in the sidebar's switcher already, so
            repeating it here was just noise. */}
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-neutral-200">
          {hi}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-neutral-400">{subtitle}</p>
      </div>

      <StatsRow stats={stats} expanded={expanded} onToggle={toggleExpand} />

      {/* Animated expand/collapse via the grid-rows trick: the outer
          grid animates `grid-template-rows` from 0fr → 1fr, which the
          browser interpolates against the child's natural height. The
          inner div clips overflow so content doesn't bleed during
          transition. `panelKey` keeps the panel mounted with its last
          shape during close so the exit animation can play out. */}
      <AnimatedExpansion
        open={expanded !== null}
        renderKey={expanded}
        workload={assigned}
        done={doneThisWeek}
        overdue={overdue}
        onClose={() => setExpanded(null)}
        onOpenTask={setOpenTaskId}
      />

      {/* Hide Focus when the Workload panel is open — the expanded list */}
      {/* already includes every task Focus would surface, so showing both */}
      {/* is just visual duplication of the same rows. */}
      {focusPicks.length > 0 && expanded !== "workload" && (
        <FocusCard picks={focusPicks} onOpen={setOpenTaskId} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-6 min-w-0">
          <SectionCard title="Due this week" count={dueThisWeek.length}>
            {dueThisWeek.length === 0 ? (
              <EmptyState
                size="compact"
                title="Nothing due this week"
                description="Tasks with a due date in the next 7 days show up here."
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-5 h-5"
                  >
                    <rect x="3" y="5" width="18" height="16" rx="2" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                    <line x1="8" y1="3" x2="8" y2="7" />
                    <line x1="16" y1="3" x2="16" y2="7" />
                  </svg>
                }
              />
            ) : (
              <TaskTable
                tasks={dueThisWeek}
                onOpenTask={setOpenTaskId}
              />
            )}
          </SectionCard>

          {sprintsEnabled && (
            <SectionCard title="Active sprints" count={activeSprints.length}>
              {activeSprints.length === 0 ? (
                <EmptyState
                  size="compact"
                  title="No active sprint"
                  description="Start a sprint from the Sprints view to see live progress here."
                  icon={
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.6}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-5 h-5"
                    >
                      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
                    </svg>
                  }
                />
              ) : (
                <div className="space-y-0.5">
                  {activeSprints.map((s) => (
                    <SprintRow
                      key={s.id}
                      sprint={s}
                      onClick={() =>
                        navigate(
                          `/w/${s.workspace_slug}/p/${s.project_key}/sprints/${s.id}`,
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </SectionCard>
          )}
        </div>

        <div className="min-w-0">
          <SectionCard title="Recent activity">
            {recentActivity.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-neutral-500 px-3 py-2">
                No activity yet.
              </p>
            ) : (
              <ActivityFeed
                items={recentActivity}
                onOpen={(id) => setOpenTaskId(id)}
              />
            )}
          </SectionCard>
        </div>
      </div>

      <TaskDetailModal
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
      />
    </div>
  );
}
