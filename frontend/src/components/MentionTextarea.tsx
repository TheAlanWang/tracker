// MentionTextarea — textarea that pops an @-autocomplete dropdown of
// workspace members. When the user types `@<prefix>` at any position, we
// filter members by display_name / email handle and let them confirm a
// selection with Enter/Tab/click. Selecting replaces the `@<prefix>` token
// in the underlying value with `@<handle>` so the backend can later parse
// the same token shape and fire `mentioned` notifications.
//
// Dropdown positioning is intentionally simple — anchored below the
// textarea, not at the visual caret. Slack/Linear's full caret-tracking
// is over-engineered for the common single-line case and would require
// measuring text in a mirror element.

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import type { Member } from "@/features/members/api";

type Props = {
  value: string;
  onChange: (v: string) => void;
  members: Member[];
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
};

// Derive the @-handle a member should be addressed by: prefer display_name's
// first word, fall back to email local part. Lowercased so we can match
// case-insensitively on the user's typed prefix.
function handleFor(m: Member): string {
  const name = (m.display_name ?? "").trim();
  if (name) return name.split(/\s+/)[0]!.toLowerCase();
  const email = m.email ?? "";
  return email.split("@", 1)[0]?.toLowerCase() ?? "";
}

// Returns the @-prefix being typed if the caret is currently inside one,
// otherwise null. We require the @ to be at start-of-text or after
// whitespace so we don't trigger on email addresses like foo@bar.
function getActiveMention(
  value: string,
  caret: number,
): { start: number; prefix: string } | null {
  // Walk back from the caret looking for an unbroken run of handle-safe
  // chars followed by an @, bounded by whitespace or string start.
  let i = caret - 1;
  while (i >= 0 && /[A-Za-z0-9._-]/.test(value[i]!)) i--;
  if (i < 0 || value[i] !== "@") return null;
  // Char before @ must be whitespace or nothing (avoids matching emails).
  if (i > 0 && !/\s/.test(value[i - 1]!)) return null;
  return { start: i, prefix: value.slice(i + 1, caret) };
}

export const MentionTextarea = forwardRef<HTMLTextAreaElement, Props>(
  function MentionTextarea(
    { value, onChange, members, placeholder, rows = 3, maxLength, className, onKeyDown },
    ref,
  ) {
    const localRef = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => localRef.current!, []);

    const [mention, setMention] = useState<{ start: number; prefix: string } | null>(null);
    const [highlighted, setHighlighted] = useState(0);
    const [pos, setPos] = useState({ left: 0, top: 0, width: 0 });

    // Candidates: members whose handle starts with the typed prefix.
    const candidates = useMemo(() => {
      if (!mention) return [];
      const p = mention.prefix.toLowerCase();
      const scored = members
        .map((m) => ({ m, h: handleFor(m) }))
        .filter(({ h }) => h && (p === "" || h.startsWith(p)));
      return scored.slice(0, 6);
    }, [mention, members]);

    // Reset highlighted row whenever the candidate list changes shape.
    useEffect(() => {
      setHighlighted(0);
    }, [mention?.prefix]);

    // Anchor the dropdown below the textarea each time it opens.
    useEffect(() => {
      if (!mention) return;
      const el = localRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({ left: r.left, top: r.bottom + 4, width: r.width });
    }, [mention]);

    function syncMention() {
      const el = localRef.current;
      if (!el) return;
      const m = getActiveMention(el.value, el.selectionStart ?? 0);
      setMention(m);
    }

    function commit(member: Member) {
      const el = localRef.current;
      if (!el || !mention) return;
      const handle = handleFor(member);
      const before = value.slice(0, mention.start);
      const after = value.slice(el.selectionStart ?? value.length);
      const next = `${before}@${handle} ${after}`;
      onChange(next);
      setMention(null);
      // Restore caret right after the inserted "@handle " token.
      const caret = before.length + handle.length + 2;
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(caret, caret);
      });
    }

    function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
      if (mention && candidates.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setHighlighted((h) => (h + 1) % candidates.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setHighlighted((h) => (h - 1 + candidates.length) % candidates.length);
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          commit(candidates[highlighted]!.m);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setMention(null);
          return;
        }
      }
      onKeyDown?.(e);
    }

    return (
      <>
        <textarea
          ref={localRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            // Schedule mention sync after the value/caret update flushes.
            requestAnimationFrame(syncMention);
          }}
          onKeyUp={syncMention}
          onClick={syncMention}
          onBlur={() => {
            // Slight delay so a mousedown on the dropdown can fire commit
            // before we hide it.
            setTimeout(() => setMention(null), 150);
          }}
          onKeyDown={handleKey}
          placeholder={placeholder}
          rows={rows}
          maxLength={maxLength}
          className={className}
        />
        {mention &&
          candidates.length > 0 &&
          createPortal(
            <div
              style={{
                position: "fixed",
                left: pos.left,
                top: pos.top,
                width: Math.min(pos.width, 280),
              }}
              className="z-50 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl py-1"
            >
              {candidates.map(({ m, h }, i) => (
                <button
                  key={m.user_id}
                  type="button"
                  // Use mousedown not click — textarea's onBlur fires before
                  // click would, and we'd lose the selection state.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(m);
                  }}
                  onMouseEnter={() => setHighlighted(i)}
                  className={`w-full text-left px-3 py-1.5 text-sm flex items-baseline gap-2 ${
                    i === highlighted ? "bg-slate-100 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  }`}
                >
                  <span className="font-medium text-slate-900 dark:text-slate-100">@{h}</span>
                  {m.display_name && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {m.display_name}
                    </span>
                  )}
                </button>
              ))}
            </div>,
            document.body,
          )}
      </>
    );
  },
);
