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

import { useEffect, useState } from "react";
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
                col.highlight ? "bg-blue-50/70 ring-1 ring-blue-200/70 dark:bg-neutral-800 dark:ring-neutral-600" : "bg-slate-100 dark:bg-neutral-800"
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

// Animated chat mock: you type a question, the assistant calls a tool and
// types back your tasks — a looping "this is what MCP feels like" demo. Driven
// by a single tick counter so the whole timeline (type → tool → reply → hold →
// loop) is deterministic; collapses to the final frame for reduced-motion.
function McpShowcase() {
  const USER = "What are my tasks today?";
  const AI = "You have 3 open in ENG. Top two:";
  const PAUSE = 14; // hold after the question lands
  const TOOL = 16; // tool-call pill shows before the reply types
  const HOLD = 54; // hold the finished thread before looping
  const aiStart = USER.length + PAUSE + TOOL;
  const total = aiStart + AI.length + HOLD;

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setTick(total);
      return;
    }
    const id = window.setInterval(() => setTick((t) => (t + 1) % total), 55);
    return () => window.clearInterval(id);
  }, [total]);

  const userText = USER.slice(0, Math.min(tick, USER.length));
  const userTyping = tick < USER.length;
  const showTool = tick >= USER.length + PAUSE;
  const aiText = AI.slice(0, Math.min(Math.max(tick - aiStart, 0), AI.length));
  const aiTyping = tick >= aiStart && tick < aiStart + AI.length;
  const showCards = tick >= aiStart + AI.length;

  const caret = (
    <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-current animate-pulse" />
  );

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xl shadow-slate-900/10 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-100 dark:border-neutral-800 px-4 h-10">
        <span className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-slate-200 dark:bg-neutral-700" />
          <span className="w-3 h-3 rounded-full bg-slate-200 dark:bg-neutral-700" />
          <span className="w-3 h-3 rounded-full bg-slate-200 dark:bg-neutral-700" />
        </span>
        <span className="ml-2 text-xs text-slate-400 dark:text-neutral-500">
          AI assistant · Trackly MCP
        </span>
      </div>
      <div className="p-5 space-y-4 text-sm h-[300px]">
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-slate-100 dark:bg-neutral-800 px-3.5 py-2 text-slate-700 dark:text-neutral-200">
            {userText}
            {userTyping && caret}
          </div>
        </div>
        {showTool && (
          <div className="space-y-2.5">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-neutral-700 px-2.5 py-1 text-xs text-slate-500 dark:text-neutral-400">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand)]" />
              called <span className="font-medium text-slate-700 dark:text-neutral-200">list_my_tasks</span>
            </div>
            {aiText && (
              <p className="text-slate-700 dark:text-neutral-200">
                {aiText}
                {aiTyping && caret}
              </p>
            )}
            {showCards && (
              <div className="space-y-2 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                {[
                  {
                    id: "ENG-42",
                    title: "Fix OAuth redirect on Safari",
                    tag: "High",
                    tagCls: "text-amber-600 dark:text-amber-500",
                  },
                  {
                    id: "ENG-39",
                    title: "Realtime activity feed",
                    tag: "In progress",
                    tagCls: "text-[var(--brand)]",
                  },
                ].map((t) => (
                  <div
                    key={t.id}
                    className="rounded-lg border border-slate-200 dark:border-neutral-800 bg-slate-50/60 dark:bg-neutral-800/40 px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] tracking-wide text-slate-400 dark:text-neutral-500">
                        {t.id}
                      </span>
                      <span className={`text-[11px] font-medium ${t.tagCls}`}>
                        {t.tag}
                      </span>
                    </div>
                    <p className="mt-0.5 text-slate-700 dark:text-neutral-200">
                      {t.title}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// How each MCP client connects to Trackly. `cmd` is a single, copyable line;
// Cursor has no add-command so we hand over the URL plus where to paste it.
// To show brand logos, drop an SVG in /public and set `logo` (e.g.
// "/clients/claude.svg") — the button renders it before the name.
const MCP_CLIENTS: Array<{
  id: string;
  name: string;
  cmd: string;
  hint?: string;
  logo?: string;
}> = [
  {
    id: "claude",
    name: "Claude Code",
    cmd: "claude mcp add --transport http trackly https://mcp.gettrackly.dev/mcp",
  },
  {
    id: "cursor",
    name: "Cursor",
    cmd: "https://mcp.gettrackly.dev/mcp",
    hint: "Settings → Tools & MCP → New MCP Server (transport: HTTP), then paste the URL.",
  },
  {
    id: "codex",
    name: "Codex",
    cmd: "codex mcp add trackly --url https://mcp.gettrackly.dev/mcp",
  },
];

// Tutorial-style connect picker: pick your client, its one-line setup reveals
// below (animated), copyable in a click.
function McpConnect() {
  const [active, setActive] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const current = MCP_CLIENTS.find((c) => c.id === active);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  return (
    <div className="mt-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-neutral-400">
        Connect it
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {MCP_CLIENTS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              setActive(active === c.id ? null : c.id);
              setCopied(false);
            }}
            className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors ${
              active === c.id
                ? "border-[var(--brand)] bg-[var(--brand)]/[0.06] text-[var(--brand)]"
                : "border-slate-200 dark:border-neutral-800 text-slate-700 dark:text-neutral-300 hover:border-slate-300 dark:hover:border-neutral-700"
            }`}
          >
            {c.logo && (
              <img src={c.logo} alt="" className="w-4 h-4 dark:invert" />
            )}
            {c.name}
          </button>
        ))}
      </div>
      {current && (
        <div className="mt-3 animate-in fade-in-0 slide-in-from-top-1 duration-200">
          <div className="flex items-center gap-3 rounded-lg bg-slate-100 dark:bg-neutral-800/60 px-3.5 py-2.5">
            <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-[13px] text-slate-700 dark:text-neutral-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {current.cmd}
            </code>
            <button
              type="button"
              onClick={() => copy(current.cmd)}
              className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-200/70 hover:text-slate-900 dark:text-neutral-400 dark:hover:bg-neutral-700/60 dark:hover:text-neutral-100 transition-colors"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          {current.hint && (
            <p className="mt-2 text-sm text-slate-500 dark:text-neutral-400">
              {current.hint}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

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
    title: "Inbox and email",
    body: "A real in-app notification center — who assigned what, who commented, who moved your due date. Plus email alerts for the urgent assignments you can't miss.",
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

      {/* MCP / built-for-AI */}
      <section className="border-t border-slate-100 dark:border-neutral-800">
        <div className="max-w-7xl mx-auto px-6 py-14 sm:py-20 grid lg:grid-cols-2 gap-10 lg:gap-16 items-start">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-neutral-400">
              Built for AI
            </p>
            <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">
              Your AI assistant works here too.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-500 dark:text-neutral-400">
              Connect Claude, Cursor, or any MCP client to Trackly. Your assistant
              reads the board, creates and updates tasks, and pulls in each
              project&rsquo;s context and links — so it works like a teammate that
              already knows your setup.
            </p>
            <McpConnect />
            <div className="mt-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-neutral-400">
                What it can do
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  "Read your board",
                  "Create & update tasks",
                  "Search tasks & projects",
                  "Comment & check off items",
                  "Pull project context",
                ].map((c) => (
                  <span
                    key={c}
                    className="rounded-full border border-slate-200 dark:border-neutral-800 px-3 py-1 text-xs text-slate-600 dark:text-neutral-300"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <McpShowcase />
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
