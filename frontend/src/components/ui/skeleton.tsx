// Skeleton — a placeholder block that pulses while real data loads.
// shadcn-style primitive: just a div with a muted background and
// `animate-pulse`. Compose into larger layouts (TaskTableSkeleton,
// DashboardSkeleton) per page.

import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-slate-100 dark:bg-neutral-800/60",
        className,
      )}
      {...props}
    />
  );
}
