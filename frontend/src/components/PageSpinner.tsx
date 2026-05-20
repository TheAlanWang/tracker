import { Loader2 } from "lucide-react";

// Full-screen centered spinner. Replaces the bare "Loading…" text we
// used to show on auth checks and initial route resolution. Lucide's
// Loader2 + `animate-spin` is the standard pattern; sized so it reads
// as "the page is doing something" without dominating the viewport.
export function PageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-950">
      <Loader2
        className="w-8 h-8 animate-spin text-slate-400 dark:text-slate-500"
        aria-label="Loading"
      />
    </div>
  );
}
