// Landing — the marketing home page shown to unauthenticated visitors.
//
// Sections: sticky nav (logo + Log in + Get started), hero (tagline + CTAs
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
        { id: "TES-12", title: "Auth: refresh token rotation", pri: "high" },
        { id: "TES-15", title: "Search bar in sidebar", pri: "med" },
      ],
      highlight: false,
    },
    {
      label: "In progress",
      cards: [
        {
          id: "TES-9",
          title: "Realtime activity feed",
          pri: "urgent",
        },
        { id: "TES-11", title: "Sprint burndown chart", pri: "med" },
      ],
      highlight: true,
    },
    {
      label: "Done",
      cards: [{ id: "TES-7", title: "Inline task creator", pri: "low" }],
      highlight: false,
    },
  ] as const;

  const pri = {
    urgent: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300",
    high: "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300",
    med: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
    low: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300",
  } as const;

  return (
    <div className="relative">
      {/* Drag-drop demo keyframes — a ghost card slides from the Todo
          column into the highlighted In progress column on loop, hinting
          at the real product's drag-and-drop without needing JS. */}
      <style>{`
        @keyframes landingDragGhost {
          0%, 8% { transform: translate(0, 0) rotate(-2deg) scale(1); opacity: 0; }
          14%, 24% { transform: translate(0, 0) rotate(-2deg) scale(1.02); opacity: 1; }
          55%, 68% { transform: translate(calc(100% + 12px), 14px) rotate(3deg) scale(1.05); opacity: 1; }
          80% { transform: translate(calc(100% + 12px), 14px) rotate(0deg) scale(1); opacity: 0.95; }
          92%, 100% { transform: translate(calc(100% + 12px), 14px) rotate(0deg) scale(1); opacity: 0; }
        }
      `}</style>
      {/* Soft gradient blob behind the mock */}
      <div
        aria-hidden
        className="absolute -inset-x-6 -inset-y-8 bg-gradient-to-br from-blue-200/50 via-violet-200/30 to-emerald-100/30 blur-3xl rounded-[3rem]"
      />
      {/* Mock browser frame */}
      <div className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl shadow-slate-900/10 overflow-hidden">
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40">
          <span className="w-2.5 h-2.5 rounded-full bg-red-300/80" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-300/80" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-300/80" />
          <span className="ml-3 text-[11px] text-slate-400 dark:text-slate-500">
            trackly.app / engineering / backend / board
          </span>
        </div>
        <div className="relative p-4 grid grid-cols-3 gap-3 bg-slate-50/40 dark:bg-slate-950/40">
          {/* Ghost card — absolutely positioned over the Todo column at
              roughly the second-row position, then translates one column
              + gap to land in the highlighted In progress column. */}
          <div
            aria-hidden
            className="absolute pointer-events-none z-10 rounded-md border border-sky-300 dark:border-sky-700 bg-white dark:bg-slate-900 shadow-xl"
            style={{
              top: "100px",
              left: "16px",
              width: "calc((100% - 56px) / 3)",
              padding: "8px",
              animation: "landingDragGhost 5s ease-in-out infinite",
            }}
          >
            <p className="text-[11px] leading-tight text-slate-800 dark:text-slate-200">
              Drag cards across columns
            </p>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300">
                {/* Pulsing red dot — Twitch / YouTube-style "this is
                    happening in realtime" cue. The outer ping ring
                    animates outward + fades; the inner dot stays solid. */}
                <span className="relative inline-flex w-1.5 h-1.5">
                  <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-75" />
                  <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                </span>
                URGENT
              </span>
              <div className="w-4 h-4 rounded-full bg-sky-500" />
            </div>
          </div>
          {cols.map((col) => (
            <div
              key={col.label}
              className={`rounded-lg p-2 min-h-[160px] ${
                col.highlight ? "bg-blue-50/80 dark:bg-blue-950/30 ring-2 ring-blue-200 dark:ring-blue-800/40" : "bg-slate-100 dark:bg-slate-800"
              }`}
            >
              <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600 dark:text-slate-400">
                {col.label}{" "}
                <span className="text-slate-400 dark:text-slate-500 font-normal">
                  {col.cards.length}
                </span>
              </p>
              <div className="space-y-1.5">
                {col.cards.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2"
                  >
                    <p className="text-[11px] leading-tight text-slate-800 dark:text-slate-200">
                      {c.title}
                    </p>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span
                        className={`text-[9px] font-semibold uppercase px-1 rounded ${pri[c.pri]}`}
                      >
                        {c.pri}
                      </span>
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{
                          background: `hsl(${(c.id.charCodeAt(4) * 47) % 360} 55% 55%)`,
                        }}
                      />
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
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 transition-shadow hover:shadow-sm">
      <div className="w-10 h-10 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 flex items-center justify-center">
        {icon}
      </div>
      <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{body}</p>
    </div>
  );
}

// ---- Theme toggle (light ↔ dark) ----

function ThemeToggle() {
  const { resolved, setTheme } = useTheme();
  const isDark = resolved === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}

// ---- Logo ----

function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <img
        src="/logo.svg"
        alt="Trackly logo"
        className="w-6 h-6 dark:invert dark:hue-rotate-180"
      />
      <span className="text-slate-900 dark:text-slate-100">trackly</span>
    </span>
  );
}

// ---- Page ----

type DialogMode = "signin" | "signup";

export default function Landing() {
  const [searchParams, setSearchParams] = useSearchParams();

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
    <div className="min-h-screen bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      {/* Nav */}
      <header className="sticky top-0 z-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-slate-100 dark:border-slate-800">
        <nav className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setDialog("signin")}
              className="px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
            >
              Log in
            </button>
            <Button
              size="sm"
              className="rounded-md"
              onClick={() => setDialog("signup")}
            >
              Get started
            </Button>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-x-0 -top-40 h-[600px] bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.12),transparent_60%)]"
        />
        <div className="relative max-w-6xl mx-auto px-6 pt-16 pb-12 sm:pt-24 sm:pb-20 grid lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1 text-xs text-slate-600 dark:text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Built for shipping teams
            </div>
            <h1 className="mt-5 text-4xl sm:text-5xl lg:text-[3.4rem] font-bold tracking-tight leading-[1.05]">
              Ship work,
              <br />
              <span className="bg-gradient-to-br from-slate-900 via-slate-700 to-slate-500 dark:from-slate-100 dark:via-slate-300 dark:to-slate-500 bg-clip-text text-transparent">
                not paperwork.
              </span>
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-slate-500 dark:text-slate-400 max-w-xl">
              An opinionated task tracker. Start with a flat list of tasks —
              turn on sprints, goals, and dependencies only when your team
              needs them.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                className="rounded-md px-6"
                onClick={() => setDialog("signup")}
              >
                Get started — free
              </Button>
              <button
                type="button"
                onClick={() => setDialog("signin")}
                className="text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 px-3 py-2"
              >
                Already have an account? Log in →
              </button>
            </div>
            <div className="mt-8 flex items-center gap-4 text-xs text-slate-400 dark:text-slate-500">
              <span>No credit card required</span>
              <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
              <span>Set up in under a minute</span>
            </div>
          </div>
          <div>
            <BoardMock />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-14 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            What you get
          </p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">
            Everything to plan a week, nothing to slow it down.
          </h2>
        </div>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <FeatureCard
            title="Kanban that feels instant"
            body="Drag, drop, and reassign without a page reload. Realtime updates so the team sees every move."
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-5 h-5">
                <rect x="3" y="4" width="6" height="16" rx="1.2" />
                <rect x="11" y="4" width="6" height="10" rx="1.2" />
                <rect x="19" y="4" width="2" height="6" rx="0.8" />
              </svg>
            }
          />
          <FeatureCard
            title="Sprints, when you want them"
            body="Turn on sprints per workspace. Burndown, velocity, and roll-overs — there when you need them, hidden when you don't."
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-5 h-5">
                <path d="M3 12a9 9 0 1 1 18 0" />
                <path d="M12 12l4-2" strokeLinecap="round" />
                <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
              </svg>
            }
          />
          <FeatureCard
            title="A dashboard that knows you"
            body="Today's focus, overdue alerts, your activity feed — surfaced the moment you log in."
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-5 h-5">
                <path d="M4 19V9l8-5 8 5v10" />
                <path d="M9 19v-6h6v6" />
              </svg>
            }
          />
          <FeatureCard
            title="Goals, when you need rollup"
            body='An optional "why" layer above tasks. Recursive hierarchy, OKR-style. Off by default; turn it on per workspace when your team thinks in objectives.'
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-5 h-5">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="5" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
              </svg>
            }
          />
          <FeatureCard
            title="Inbox, not email"
            body="A real notification center. See who assigned what, who commented, who changed your due date."
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-5 h-5">
                <path d="M6 8a6 6 0 1 1 12 0v5l1.5 3H4.5L6 13z" />
                <path d="M10 18a2 2 0 0 0 4 0" />
              </svg>
            }
          />
          <FeatureCard
            title="Keyboard-first"
            body="Built so you almost never need the mouse. Quick switcher, slash commands, jump-to-task."
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-5 h-5">
                <rect x="2.5" y="6" width="19" height="12" rx="1.5" />
                <path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" strokeLinecap="round" />
              </svg>
            }
          />
        </div>
      </section>

      {/* CTA strip */}
      <section className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
        <div className="max-w-6xl mx-auto px-6 py-14 sm:py-16 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <h3 className="text-2xl font-bold tracking-tight">
              Start tracking in a minute.
            </h3>
            <p className="mt-1.5 text-slate-500 dark:text-slate-400">
              Create a workspace, add your first task, and ship.
            </p>
          </div>
          <Button
            size="lg"
            className="rounded-md px-6"
            onClick={() => setDialog("signup")}
          >
            Get started — free
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
          <Logo className="text-slate-500 dark:text-slate-400" />
          <span>© {new Date().getFullYear()} Trackly</span>
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
