// Hierarchical Lucide icon for TaskPriority — shape conveys priority
// level so a board card or dropdown row can be scanned without parsing
// the "HIGH" / "MEDIUM" / "URGENT" pill text. Pair with <PriorityPill>
// when a textual label is still needed (e.g., dropdown options); use
// alone in dense card contexts like Board.

import {
  AlertTriangle,
  ChevronDown,
  CircleDashed,
  Equal,
  type LucideIcon,
} from "lucide-react";

import type { TaskPriority } from "@/features/tasks/api";
import { PRIORITY } from "@/features/tasks/labels";

// Custom "3 chevrons up" icon — Lucide ships only `ChevronsUp` (2 stacked
// chevrons) which feels too light for the "highest non-urgent" tier.
// Three chevrons tightly stacked matches the Linear / Notion priority
// vocabulary for HIGH. viewBox matches Lucide's 24x24 so it slots into
// the same className-driven sizing as the other icons in this map.
function TripleChevronUp({
  className,
  strokeWidth = 2,
  ...rest
}: React.SVGProps<SVGSVGElement> & { strokeWidth?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      <path d="m18 9-6-6-6 6" />
      <path d="m18 15-6-6-6 6" />
      <path d="m18 21-6-6-6 6" />
    </svg>
  );
}

const ICON: Record<TaskPriority, LucideIcon | typeof TripleChevronUp> = {
  urgent: AlertTriangle,
  high: TripleChevronUp,
  medium: Equal,
  low: ChevronDown,
  no_priority: CircleDashed,
};

// Dark mode priority colors use -500 (one step darker than -400) so
// they read as "informational accent" rather than "neon highlight"
// against the neutral dark background. Light mode keeps -600 for
// proper contrast on white.
const COLOR: Record<TaskPriority, string> = {
  urgent: "text-red-600 dark:text-red-500",
  high: "text-orange-600 dark:text-orange-500",
  medium: "text-yellow-500 dark:text-yellow-500",
  low: "text-slate-400 dark:text-neutral-500",
  no_priority: "text-slate-300 dark:text-neutral-600",
};

type Props = {
  priority: TaskPriority;
  // When true (Board task card style), no_priority renders nothing so an
  // unset task doesn't burn a pixel slot. Default false (dropdown style)
  // renders CircleDashed so all 5 picker options stay symmetric.
  hideNoPriority?: boolean;
  className?: string;
};

export function PriorityIcon({
  priority,
  hideNoPriority = false,
  className,
}: Props) {
  if (hideNoPriority && priority === "no_priority") return null;
  const Icon = ICON[priority];
  const label = PRIORITY[priority].label;
  return (
    <span
      title={label}
      aria-label={label}
      className="inline-flex items-center"
    >
      <Icon
        className={`w-3.5 h-3.5 ${COLOR[priority]} ${className ?? ""}`}
        strokeWidth={3}
      />
    </span>
  );
}
