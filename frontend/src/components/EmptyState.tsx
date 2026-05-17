// EmptyState — reusable "no data here" placeholder.
//
// Centered icon → title → description → optional action. Replaces the
// scatter of bare "No tasks", "Nothing due" inline paragraphs. Having a
// single primitive means every empty view in the app gets the same
// vertical rhythm and dark-mode treatment.

import type { ReactNode } from "react";

type Props = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  // Compact mode for tight spaces (Dashboard cards, inside lists) — less
  // vertical padding, smaller icon.
  size?: "default" | "compact";
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  size = "default",
}: Props) {
  const compact = size === "compact";
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "py-6" : "py-12"
      }`}
    >
      {icon && (
        <div
          className={`rounded-full bg-slate-100 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 flex items-center justify-center ${
            compact ? "w-10 h-10 mb-2.5" : "w-12 h-12 mb-3"
          }`}
        >
          {icon}
        </div>
      )}
      <h3
        className={`font-medium text-slate-900 dark:text-slate-100 ${
          compact ? "text-sm" : "text-sm"
        }`}
      >
        {title}
      </h3>
      {description && (
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
