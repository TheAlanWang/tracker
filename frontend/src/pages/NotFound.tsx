// 404 page — shown when the catch-all route fires. Replaces the
// previous `<Navigate to="/" replace />` behavior, which silently
// teleported users home and made every typo feel like a bug. Now there's
// an explicit "this page doesn't exist" affordance with a way home.

import { Link, useLocation } from "react-router-dom";

import { buttonVariants } from "@/components/ui/button";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function NotFound() {
  useDocumentTitle("Not found");
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-neutral-950 p-6">
      <div className="max-w-md w-full text-center space-y-5">
        <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-6 h-6"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-neutral-500">
            404
          </p>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-neutral-200">
            Page not found
          </h1>
          <p className="text-sm text-slate-500 dark:text-neutral-400">
            We couldn't find{" "}
            <code className="font-mono text-slate-700 dark:text-neutral-300">
              {pathname}
            </code>
            . It may have been moved, or the link is broken.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2">
          <Link to="/" className={buttonVariants()}>Go home</Link>
        </div>
      </div>
    </div>
  );
}
