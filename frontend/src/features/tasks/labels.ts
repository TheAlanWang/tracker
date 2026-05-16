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
