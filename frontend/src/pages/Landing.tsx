// Landing — the marketing home page shown to unauthenticated visitors.
//
// Sections: sticky nav (logo + Log in + Get Started), hero (tagline + CTAs
// + a stylized Board "screenshot" rendered inline as a BoardMock), six
// feature cards, a CTA strip, footer.
//
// Sign-in / sign-up is driven via the `?login=...` URL param so the modal
// (LoginDialog) state lives in the URL — that lets unauthenticated visits
// to a protected route bounce here via /?login=open and have the modal
// auto-open.

import { Moon, Sun } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { LoginDialog } from "@/components/LoginDialog";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";

// ---- Decorative mock of the app's Board ----

function BoardMock() {
  const cols = [
    {
      label: "Todo",
      cards: [
        { id: "TES-12", title: "Auth: refresh token rotation" },
        { id: "TES-15", title: "Search bar in sidebar" },
      ],
      highlight: false,
    },
    {
      label: "In progress",
      cards: [
        { id: "TES-9", title: "Realtime activity feed" },
        { id: "TES-11", title: "Sprint burndown chart" },
      ],
      highlight: true,
    },
    {
      label: "Done",
      cards: [{ id: "TES-7", title: "Inline task creator" }],
      highlight: false,
    },
  ] as const;

  return (
    <div className="relative">
      {/* Mock browser frame */}
      <div className="relative rounded-2xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xl shadow-slate-900/10 overflow-hidden">
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-slate-100 dark:border-neutral-800 bg-slate-50/80 dark:bg-neutral-800/40">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-neutral-600" />
          <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-neutral-600" />
          <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-neutral-600" />
          <span className="ml-3 text-[11px] text-slate-400 dark:text-neutral-500">
            gettrackly.dev / engineering / board
          </span>
        </div>
        <div className="p-4 grid grid-cols-3 gap-3 bg-slate-50/40 dark:bg-neutral-950/40">
          {cols.map((col) => (
            <div
              key={col.label}
              className={`rounded-lg p-2 min-h-[150px] ${
                col.highlight ? "bg-blue-50/70 dark:bg-blue-950/20 ring-1 ring-blue-200/70 dark:ring-blue-800/30" : "bg-slate-100 dark:bg-neutral-800"
              }`}
            >
              <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-neutral-400">
                {col.label}{" "}
                <span className="text-slate-400 dark:text-neutral-500 font-normal">
                  {col.cards.length}
                </span>
              </p>
              <div className="space-y-1.5">
                {col.cards.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-md border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-2.5"
                  >
                    <p className="text-[11px] leading-tight text-slate-700 dark:text-neutral-300">
                      {c.title}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="font-mono text-[9px] tracking-wide text-slate-400 dark:text-neutral-500">
                        {c.id}
                      </span>
                      <div className="w-4 h-4 rounded-full bg-slate-200 dark:bg-neutral-700" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- Feature card ----

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 transition-shadow hover:shadow-sm">
      <div className="w-10 h-10 rounded-lg bg-slate-50 dark:bg-neutral-800/40 text-slate-700 dark:text-neutral-300 flex items-center justify-center">
        {icon}
      </div>
      <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-neutral-200">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-neutral-400">{body}</p>
    </div>
  );
}

// ---- Feature list (data) ----
// Defined as a module-level constant so the marquee track can render it twice
// (for a seamless infinite loop) without duplicating six JSX blocks inline.

const FEATURES: Array<{
  title: string;
  body: string;
  icon: React.ReactNode;
}> = [
  {
    title: "Kanban that feels instant",
    body: "Drag, drop, and reassign without a page reload. Realtime updates so the team sees every move.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-5 h-5">
        <rect x="3" y="4" width="6" height="16" rx="1.2" />
        <rect x="11" y="4" width="6" height="10" rx="1.2" />
        <rect x="19" y="4" width="2" height="6" rx="0.8" />
      </svg>
    ),
  },
  {
    title: "Sprints, when you want them",
    body: "Turn on sprints per workspace. Burndown, velocity, and roll-overs — there when you need them, hidden when you don't.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-5 h-5">
        <path d="M3 12a9 9 0 1 1 18 0" />
        <path d="M12 12l4-2" strokeLinecap="round" />
        <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    title: "Goals, when you need rollup",
    body: 'An optional "why" layer above tasks. Recursive hierarchy, OKR-style. Off by default; turn it on per workspace when your team thinks in objectives.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-5 h-5">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    title: "A dashboard that knows you",
    body: "Today's focus, overdue alerts, your activity feed — surfaced the moment you log in.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-5 h-5">
        <path d="M4 19V9l8-5 8 5v10" />
        <path d="M9 19v-6h6v6" />
      </svg>
    ),
  },
  {
    title: "Inbox, not email",
    body: "A real notification center. See who assigned what, who commented, who changed your due date.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-5 h-5">
        <path d="M6 8a6 6 0 1 1 12 0v5l1.5 3H4.5L6 13z" />
        <path d="M10 18a2 2 0 0 0 4 0" />
      </svg>
    ),
  },
  {
    title: "Keyboard-first",
    body: "Built so you almost never need the mouse. Quick switcher, slash commands, jump-to-task.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-5 h-5">
        <rect x="2.5" y="6" width="19" height="12" rx="1.5" />
        <path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" strokeLinecap="round" />
      </svg>
    ),
  },
];

// ---- Logo ----

function Logo({
  className = "",
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md";
}) {
  const imgCls = size === "md" ? "w-8 h-8" : "w-5 h-5";
  const txtCls = size === "md" ? "text-xl" : "text-sm";
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <img
        src="/logo.svg"
        alt="Trackly logo"
        className={`${imgCls} dark:invert dark:hue-rotate-180`}
      />
      <span className={`${txtCls} text-slate-900 dark:text-neutral-200`}>Trackly</span>
    </span>
  );
}

// ---- Page ----

type DialogMode = "signin" | "signup";

export default function Landing() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { resolved, setTheme } = useTheme();
  const isDark = resolved === "dark";

  // The `login` URL param is the single source of truth for the dialog. Lets
  // /?login=open (protected-route bounce, 401 interceptor) auto-open without
  // a separate useEffect, and keeps state in one place.
  const loginParam = searchParams.get("login");
  const dialogMode: DialogMode | null =
    loginParam === "open"
      ? "signin"
      : loginParam === "signup"
        ? "signup"
        : null;

  const setDialog = (mode: DialogMode | null) => {
    const next = new URLSearchParams(searchParams);
    if (mode === null) next.delete("login");
    else next.set("login", mode === "signup" ? "signup" : "open");
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-900 text-slate-900 dark:text-neutral-200">
      {/* Nav */}
      <header className="sticky top-0 z-20 bg-white/80 dark:bg-neutral-900/80 backdrop-blur border-b border-slate-100 dark:border-neutral-800">
        <nav className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDialog("signin")}
              className="inline-flex items-center h-8 px-3 rounded-md text-sm font-medium text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 hover:text-slate-900 dark:hover:text-neutral-100"
            >
              Log in
            </button>
            <Button
              className="rounded-md"
              onClick={() => setDialog("signup")}
            >
              Get Started
            </Button>
          </div>
        </nav>
      </header>

      {/* Hero — centered copy, product mock below */}
      <section className="relative">
        <div className="relative max-w-5xl mx-auto px-6 pt-24 pb-10 sm:pt-36 text-center">
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.02] text-slate-900 dark:text-neutral-100">
            Built for your team
            <br />
            and your AI
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-500 dark:text-neutral-400 max-w-3xl mx-auto">
            Start with a simple task list. Turn on features only when you need them.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <Button
              size="lg"
              className="rounded-md px-6"
              onClick={() => setDialog("signup")}
            >
              Get Started
            </Button>
          </div>
        </div>
        <div className="relative max-w-6xl mx-auto px-6 pb-16 sm:pb-20">
          <BoardMock />
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-6 py-14 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-neutral-400">
            What you get
          </p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">
            Everything to plan a week, nothing to slow it down.
          </h2>
        </div>
        {/* Auto-scrolling feature row (marquee). Track renders FEATURES
            twice and animates -50% for a seamless loop. Pauses on hover;
            respects prefers-reduced-motion (motion-safe: prefix). */}
        <div
          className="mt-10 relative overflow-hidden group"
          aria-label="Feature highlights"
        >
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-white dark:from-neutral-900 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-white dark:from-neutral-900 to-transparent" />
          <div className="flex w-max gap-4 motion-safe:animate-marquee group-hover:[animation-play-state:paused]">
            {[...FEATURES, ...FEATURES].map((f, i) => (
              <div key={i} className="w-80 shrink-0" aria-hidden={i >= FEATURES.length}>
                <FeatureCard title={f.title} body={f.body} icon={f.icon} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA strip */}
      <section className="border-t border-slate-100 dark:border-neutral-800 bg-slate-50/50 dark:bg-neutral-800/20">
        <div className="max-w-7xl mx-auto px-6 py-14 sm:py-16 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <h3 className="text-2xl font-bold tracking-tight">
              Start tracking in a minute.
            </h3>
            <p className="mt-1.5 text-slate-500 dark:text-neutral-400">
              Create a workspace, add your first task, and ship.
            </p>
          </div>
          <Button
            size="lg"
            className="rounded-md px-6"
            onClick={() => setDialog("signup")}
          >
            Create your workspace
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 dark:border-neutral-800">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between text-xs text-slate-400 dark:text-neutral-500">
          <Logo size="sm" className="text-slate-500 dark:text-neutral-400" />
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
              className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800 hover:text-slate-900 dark:hover:text-neutral-100 transition-colors"
            >
              {isDark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
            </button>
            <span>© {new Date().getFullYear()} Trackly</span>
          </div>
        </div>
      </footer>

      {dialogMode && (
        <LoginDialog
          initialMode={dialogMode}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
