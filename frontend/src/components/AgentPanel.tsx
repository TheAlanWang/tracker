import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUp, Loader2, Sparkles, Square, Trash2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useAgentChat, type AgentToolEntry } from "@/features/agent/api";

// Compact prose for the narrow panel: tighter heading/list rhythm than the
// default `prose`, inline code styled for task slugs.
const PROSE =
  "prose prose-sm max-w-none text-slate-700 dark:prose-invert dark:text-neutral-200 " +
  "prose-headings:text-sm prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1 " +
  "prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-hr:my-3 " +
  "prose-code:bg-slate-100 dark:prose-code:bg-neutral-800/60 prose-code:rounded prose-code:px-1 " +
  "prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-normal prose-code:before:hidden prose-code:after:hidden";

const EXAMPLE_PROMPTS = [
  "What's on my board right now?",
  "Break “launch the landing page” into tasks",
  "Move the most urgent task to In Progress",
];

type Props = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  wsSlug: string;
  // When opened from a task page, the identifier of the task in view. Focuses
  // the (still project-scoped) assistant on that task. Omitted elsewhere.
  focusTask?: string;
};

export function AgentPanel({
  open,
  onClose,
  projectId,
  projectName,
  wsSlug,
  focusTask,
}: Props) {
  const { messages, isStreaming, quota, blocked, send, stop, clearChat } =
    useAgentChat(projectId, focusTask);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Resizable width — drag the left edge. Persisted so it sticks across opens.
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem("agentPanelWidth"));
    return saved >= 360 && saved <= 760 ? saved : 420;
  });
  const widthRef = useRef(width);
  widthRef.current = width;

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      // Panel is pinned right; dragging its left edge sets width from the
      // distance to the viewport's right edge.
      const w = Math.min(760, Math.max(360, window.innerWidth - ev.clientX));
      setWidth(w);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      localStorage.setItem("agentPanelWidth", String(widthRef.current));
    };
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // Esc closes the panel.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Keep the thread pinned to the latest message as it streams. Also fires on
  // isStreaming so the "Working…" indicator scrolls into view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, isStreaming]);

  if (!open) return null;

  // Grow the textarea with its content, up to ~8 lines (192px), after which
  // it scrolls. Without this a multi-line message overflows the fixed 1-row
  // box and the top lines get clipped.
  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 192)}px`;
  }

  function submit() {
    const el = inputRef.current;
    if (!el) return;
    const text = el.value;
    el.value = "";
    el.style.height = "auto"; // collapse back to one row after sending
    send(text);
  }

  return (
    <>
      {/* Transparent click-catcher: clicking anywhere on the board (left of
          the panel) collapses the assistant. Transparent — the board stays
          fully visible, not dimmed; this just captures the dismiss click. */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label="AI assistant"
        style={{ width }}
        className="fixed inset-y-0 right-0 z-50 flex max-w-[100vw] flex-col border-l border-slate-200 bg-white shadow-2xl shadow-slate-900/10 dark:border-neutral-800 dark:bg-neutral-900 animate-in slide-in-from-right duration-200 motion-reduce:animate-none"
      >
      {/* Drag handle on the left edge to resize. */}
      <div
        onMouseDown={startResize}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize assistant panel"
        className="absolute inset-y-0 left-0 z-10 w-1.5 -translate-x-1/2 cursor-col-resize bg-transparent transition-colors hover:bg-[var(--brand)]/30"
      />
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 h-12 dark:border-neutral-800">
          <Sparkles className="h-4 w-4 text-[var(--brand)]" strokeWidth={2} />
          <span className="text-sm font-medium text-slate-800 dark:text-neutral-200">
            AI assistant
          </span>
          <span className="truncate text-xs text-slate-400 dark:text-neutral-500">
            · {projectName}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            {quota && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] tabular-nums text-slate-500 dark:bg-neutral-800 dark:text-neutral-400">
                {quota.remaining} left
              </span>
            )}
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clearChat}
                aria-label="Clear chat"
                title="Clear chat (keeps long-term memory)"
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close assistant"
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Thread */}
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
          {messages.length === 0 && blocked === null && (
            <div className="space-y-3 pt-2">
              <p className="text-slate-500 dark:text-neutral-400">
                Ask about this project, or tell me what to do — I can create,
                assign, and update tasks on this board.
              </p>
              <div className="space-y-2">
                {EXAMPLE_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => send(p)}
                    className="block w-full rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-left text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-100 dark:border-neutral-800 dark:bg-neutral-800/40 dark:text-neutral-300 dark:hover:border-neutral-700"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-slate-100 px-3.5 py-2 text-slate-700 dark:bg-neutral-800 dark:text-neutral-200">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} className="space-y-2.5">
                {(m.tools ?? []).map((t, j) => (
                  <ToolPill key={j} tool={t} />
                ))}
                {m.content && (
                  <div className={PROSE}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {m.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            ),
          )}

          {/* Persistent activity indicator: the agent works in bursts (model
              turn → tool calls → next turn), so there are gaps with no new
              text. Show "Working…" the whole time it's busy so it never looks
              stuck. */}
          {isStreaming && (
            <div className="flex items-center gap-2 text-slate-400 dark:text-neutral-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="text-xs">Working…</span>
            </div>
          )}

          {blocked === "quota" && <QuotaBlocked wsSlug={wsSlug} quota={quota} />}
          {blocked === "not_configured" && <NotConfigured />}
        </div>

        {/* Composer */}
        <div className="border-t border-slate-100 p-3 dark:border-neutral-800">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 focus-within:border-slate-300 dark:border-neutral-700 dark:bg-neutral-900">
            <textarea
              ref={inputRef}
              rows={1}
              disabled={blocked === "not_configured"}
              placeholder={
                blocked === "quota"
                  ? "Out of messages this month"
                  : "Ask or instruct…"
              }
              onInput={(e) => autoGrow(e.currentTarget)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!isStreaming) submit();
                }
              }}
              className="max-h-48 flex-1 resize-none overflow-y-auto bg-transparent py-1 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed dark:text-neutral-200 dark:placeholder:text-neutral-500"
            />
            {isStreaming ? (
              <button
                type="button"
                onClick={stop}
                aria-label="Stop"
                className="shrink-0 rounded-lg bg-slate-100 p-1.5 text-slate-600 hover:bg-slate-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
              >
                <Square className="h-4 w-4" fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={blocked !== null}
                aria-label="Send"
                className="shrink-0 rounded-lg bg-[var(--brand)] p-1.5 text-white transition-colors hover:bg-[var(--brand-hover)] disabled:opacity-40"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

function ToolPill({ tool }: { tool: AgentToolEntry }) {
  const dot =
    tool.status === "running"
      ? "bg-[var(--brand)] animate-pulse"
      : tool.status === "ok"
        ? "bg-emerald-500"
        : "bg-red-500";
  return (
    <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-500 dark:border-neutral-700 dark:text-neutral-400">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <span className="truncate">
        {tool.summary ? (
          tool.summary
        ) : (
          <>
            called{" "}
            <span className="font-medium text-slate-700 dark:text-neutral-200">
              {tool.name}
            </span>
          </>
        )}
      </span>
    </div>
  );
}

function QuotaBlocked({
  wsSlug,
  quota,
}: {
  wsSlug: string;
  quota: { cap: number } | null;
}) {
  return (
    // Gold, not cobalt: gold is the Pro identity across the app (the
    // "Gold-Is-Pro" rule), so the upgrade prompt wears it too.
    <div className="rounded-lg border border-[#C9A227]/40 bg-[#C9A227]/[0.06] p-4 dark:border-[#E8C766]/30 dark:bg-[#E8C766]/[0.06]">
      <p className="text-sm font-medium text-slate-800 dark:text-neutral-200">
        Out of AI messages this month
      </p>
      <p className="mt-1 text-sm text-slate-500 dark:text-neutral-400">
        {quota
          ? `You've used all ${quota.cap} of this month's assistant messages.`
          : "You've used this month's assistant messages."}{" "}
        Upgrade to Pro for a much larger monthly allowance.
      </p>
      <Link
        to={`/w/${wsSlug}/billing`}
        className="mt-3 inline-flex items-center rounded-lg bg-[#C9A227] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#b8941f] dark:bg-[#C9A227] dark:hover:bg-[#b8941f]"
      >
        Upgrade to Pro
      </Link>
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
      <p className="text-sm font-medium text-slate-800 dark:text-neutral-200">
        AI assistant isn't configured
      </p>
      <p className="mt-1 text-sm text-slate-500 dark:text-neutral-400">
        This deployment doesn't have an Anthropic API key set, so the assistant
        is unavailable.
      </p>
    </div>
  );
}
