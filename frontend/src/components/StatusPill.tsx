// Single visual component for TaskStatus / TaskPriority chips. Every
// surface — board cards, list tables, task-detail header, dropdowns —
// renders through these so they stay in sync. Tweak the shape / sizing
// here and it changes everywhere.

import type { TaskPriority, TaskStatus } from "@/features/tasks/api";
import { PRIORITY, STATUS } from "@/features/tasks/labels";

type Size = "sm" | "md";

// `sm` is for embedded/dense contexts (task-tree rows, dependency lists,
// board cards). `md` is the default for top-level pills in list tables and
// the task-detail panel.
const SIZE_CLASS: Record<Size, string> = {
  sm: "text-[10px] px-1.5 py-0.5",
  md: "text-[11px] px-2 py-0.5",
};

// `uppercase tracking-wider` gives the pill a "state label" feel (à la
// GitHub / Linear). At chip sizes, all-caps text reads heavier than mixed
// case, so we pair it with `font-medium` (not bold) and the wider tracking
// to avoid feeling cramped.
const BASE =
  "inline-flex items-center rounded-full font-medium uppercase tracking-wider";

export function StatusPill({
  status,
  size = "md",
  className = "",
}: {
  status: TaskStatus;
  size?: Size;
  className?: string;
}) {
  const v = STATUS[status];
  return (
    <span className={`${BASE} ${SIZE_CLASS[size]} ${v.pill} ${className}`}>
      {v.label}
    </span>
  );
}

export function PriorityPill({
  priority,
  size = "md",
  hideNoPriority = false,
  className = "",
}: {
  priority: TaskPriority;
  size?: Size;
  // When true, "no_priority" renders an em-dash placeholder instead of an
  // empty pill — keeps list tables tidy.
  hideNoPriority?: boolean;
  className?: string;
}) {
  if (hideNoPriority && priority === "no_priority") {
    return <span className="text-xs text-slate-300 dark:text-neutral-600">—</span>;
  }
  const v = PRIORITY[priority];
  return (
    <span className={`${BASE} ${SIZE_CLASS[size]} ${v.pill} ${className}`}>
      {v.label}
    </span>
  );
}
