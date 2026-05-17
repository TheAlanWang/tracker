// Single source of truth for TaskStatus / TaskPriority display.
//
// Every component that renders a status or priority reads from `STATUS[s]`
// or `PRIORITY[p]`. `.label` is the human-readable string; `.pill` is the
// Tailwind classes for a Notion-style chip (soft tinted bg + matching text).
// Canonical sort order lives in STATUS_ORDER / PRIORITY_ORDER so Board
// columns, FilterBar dropdowns, and filters.ts sort weights all read from
// one place. Edit here, everywhere reorders.

import type { TaskPriority, TaskStatus } from "./api";

export type StatusVisual = {
  label: string;
  pill: string;
};

export type PriorityVisual = {
  label: string;
  pill: string;
};

// Palette: "Linear Pro" — bg-100 / text-800 (deeper, more present than the
// older bg-50/text-700). Hue choices favor `sky` / `violet` over `blue` /
// `purple` for softer feel; `emerald` stays for completion. Slate covers
// quiet states. Tuned to pair with `uppercase tracking-wider` in BASE.
export const STATUS: Record<TaskStatus, StatusVisual> = {
  backlog: {
    label: "Backlog",
    pill: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400",
  },
  todo: {
    label: "To do",
    pill: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300",
  },
  in_progress: {
    label: "In progress",
    pill: "bg-sky-100 dark:bg-sky-950/40 text-sky-800 dark:text-sky-200",
  },
  in_review: {
    label: "In review",
    pill: "bg-violet-100 dark:bg-violet-950/40 text-violet-800 dark:text-violet-200",
  },
  done: {
    label: "Done",
    pill: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200",
  },
  cancelled: {
    label: "Cancelled",
    pill: "bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-500",
  },
};

export const PRIORITY: Record<TaskPriority, PriorityVisual> = {
  urgent: {
    label: "Urgent",
    pill: "bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-200",
  },
  high: {
    label: "High",
    pill: "bg-orange-100 dark:bg-orange-950/40 text-orange-800 dark:text-orange-200",
  },
  medium: {
    label: "Medium",
    pill: "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200",
  },
  low: {
    label: "Low",
    pill: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400",
  },
  no_priority: {
    label: "No priority",
    pill: "bg-transparent text-slate-400 dark:text-slate-500",
  },
};

export const STATUS_ORDER: readonly TaskStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "cancelled",
];

export const PRIORITY_ORDER: readonly TaskPriority[] = [
  "urgent",
  "high",
  "medium",
  "low",
  "no_priority",
];
