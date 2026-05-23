import { Loader2 } from "lucide-react";

// Full-screen centered spinner. Replaces the bare "Loading…" text we
// used to show on auth checks and initial route resolution. Lucide's
// Loader2 + `animate-spin` is the standard pattern; sized so it reads
// as "the page is doing something" without dominating the viewport.
export function PageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-neutral-950">
      <Loader2
        className="w-8 h-8 animate-spin text-slate-400 dark:text-neutral-500"
        aria-label="Loading"
      />
    </div>
  );
}

// For loading states inside an already-rendered layout (Settings sidebar
// still visible, a section card waiting on its own data, etc.). Doesn't
// lock the viewport; centers itself within whatever container it lives
// in. The standard "Loading…" text we used to drop here read cheap and
// shifted layout — a small spinning Loader2 keeps the container's
// dimensions stable across the loading → loaded transition.
export function InlineSpinner({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center py-8 ${className ?? ""}`}>
      <Loader2
        className="w-5 h-5 animate-spin text-slate-400 dark:text-neutral-500"
        aria-label="Loading"
      />
    </div>
  );
}
