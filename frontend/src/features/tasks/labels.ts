// Shared display labels + Tailwind style classes for TaskStatus / TaskPriority.
// One source of truth — keeps Board, List, Backlog, Dashboard, Sprint Detail,
// My Tasks, and TaskDetail consistent.

import type { TaskPriority, TaskStatus } from "./api";

export const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  in_review: "In review",
  done: "Done",
  cancelled: "Cancelled",
};

// Style classes for status badges (inline-flex rounded pill).
// Tone reflects the workflow: muted (backlog/cancelled), neutral (todo),
// progress colors (in_progress=blue, in_review=purple), success (done).
export const STATUS_STYLE: Record<TaskStatus, string> = {
  backlog: "bg-slate-100 text-slate-600",
  todo: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  in_review: "bg-purple-100 text-purple-700",
  done: "bg-green-100 text-green-700",
  cancelled: "bg-slate-100 text-slate-400",
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  no_priority: "No priority",
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

// Hot colors for urgency (urgent=red, high=orange, medium=amber),
// muted for low, transparent for no_priority (so it disappears visually).
export const PRIORITY_STYLE: Record<TaskPriority, string> = {
  urgent: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-500",
  no_priority: "text-slate-400",
};

// Linear-style dot indicators for compact-row list views (no pill bg).
// Dot color carries the semantic, label text stays neutral grey for
// quiet readability — pills look heavy on every row, dots don't.
export const STATUS_DOT: Record<TaskStatus, string> = {
  backlog: "bg-slate-300 dark:bg-slate-600",
  todo: "bg-slate-500 dark:bg-slate-400",
  in_progress: "bg-blue-500",
  in_review: "bg-purple-500",
  done: "bg-emerald-500",
  cancelled: "bg-slate-300 dark:bg-slate-700",
};

export const PRIORITY_DOT: Record<TaskPriority, string> = {
  urgent: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-amber-500",
  low: "bg-slate-400 dark:bg-slate-500",
  no_priority: "bg-transparent",
};

// Text color paired with PRIORITY_DOT — gives a subtle hue to the
// label without going full pill. Slate for low / no_priority since
// they shouldn't pop visually.
export const PRIORITY_TEXT: Record<TaskPriority, string> = {
  urgent: "text-red-700 dark:text-red-300",
  high: "text-orange-700 dark:text-orange-300",
  medium: "text-amber-700 dark:text-amber-300",
  low: "text-slate-600 dark:text-slate-400",
  no_priority: "text-slate-400 dark:text-slate-500",
};

// Notion-style pill: rounded-full chip with a soft tinted background
// and matching tint text. Pairs with the colored DOT for redundancy
// (so colorblind users still get a label even if the tint is subtle).
export const STATUS_PILL: Record<TaskStatus, string> = {
  backlog: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
  todo: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300",
  in_progress: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
  in_review: "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300",
  done: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300",
  cancelled: "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500",
};

export const PRIORITY_PILL: Record<TaskPriority, string> = {
  urgent: "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300",
  high: "bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300",
  medium: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300",
  low: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
  no_priority: "bg-transparent text-slate-400 dark:text-slate-500",
};
