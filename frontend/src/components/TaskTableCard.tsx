// Shared wrapper for the app's task tables (My Tasks, project list, Backlog,
// Browse, Sprint detail). Owns the outer card, the overflow scroll, the
// table-fixed layout, and the sticky blurred thead. Each page provides its
// own columns (widths via Tailwind on each <th>) and tbody. Edit the chrome
// here, every list page updates.

import type React from "react";

export function TaskTableCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm table-fixed">{children}</table>
      </div>
    </div>
  );
}

export function TaskTableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="sticky top-0 z-10 bg-slate-50/70 dark:bg-neutral-800/40 backdrop-blur border-b border-slate-200 dark:border-neutral-800">
      {children}
    </thead>
  );
}
