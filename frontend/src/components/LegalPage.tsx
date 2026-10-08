// Shared chrome for the public /privacy and /terms pages. Plain, readable
// long-form layout — no auth, no app shell — so the URLs work as the
// privacy-policy / terms links required by the Google OAuth consent screen.

import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export const LEGAL_CONTACT_EMAIL = "alanwang166@gmail.com";

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  useDocumentTitle(title);

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 text-slate-700 dark:text-neutral-300">
      <header className="border-b border-slate-100 dark:border-neutral-800">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center">
          <Link to="/" className="inline-flex items-center gap-2 font-semibold tracking-tight">
            <img src="/logo.svg" alt="" className="w-5 h-5 dark:invert dark:hue-rotate-180" />
            <span className="text-sm text-slate-900 dark:text-neutral-200">Trackly</span>
          </Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <h1 className="text-3xl font-semibold text-slate-900 dark:text-neutral-100">
          {title}
        </h1>
        <p className="mt-2 text-sm text-slate-400 dark:text-neutral-500">
          Last updated {updated}
        </p>
        <div className="mt-8 space-y-4 text-[15px] leading-relaxed [&_h2]:mt-10 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 dark:[&_h2]:text-neutral-100 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_a]:underline [&_a]:underline-offset-2 [&_strong]:text-slate-900 dark:[&_strong]:text-neutral-100">
          {children}
        </div>
      </main>
      <footer className="border-t border-slate-100 dark:border-neutral-800">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4 text-xs text-slate-500 dark:text-neutral-400">
          <Link to="/privacy" className="hover:text-slate-900 dark:hover:text-neutral-100">Privacy</Link>
          <Link to="/terms" className="hover:text-slate-900 dark:hover:text-neutral-100">Terms</Link>
          <span className="ml-auto">© {new Date().getFullYear()} Trackly</span>
        </div>
      </footer>
    </div>
  );
}
