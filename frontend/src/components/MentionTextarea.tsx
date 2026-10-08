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

import { Avatar } from "@/components/Avatar";
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
  // Optional clipboard / drag-drop handlers — used to wire image upload
  // (useImagePasteUpload) onto the composer. They don't interfere with the
  // internal @-mention logic on the textarea.
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onDrop?: (e: React.DragEvent<HTMLTextAreaElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLTextAreaElement>) => void;
  onDragLeave?: (e: React.DragEvent<HTMLTextAreaElement>) => void;
};

// Derive the @-handle a member should be addressed by: prefer display_name's
// first word, fall back to email local part. Lowercased so we can match
// case-insensitively on the user's typed prefix.
function handleFor(m: Member): string {
  const name = (m.display_name ?? "").trim();
  if (name) return name.split(/\s+/)[0]!.toLowerCase();
  return emailHandleFor(m);
}

function emailHandleFor(m: Member): string {
  return (m.email ?? "").split("@", 1)[0]?.toLowerCase() ?? "";
}

// The token actually inserted for a picked member. The backend notifies
// everyone whose first-name handle OR email local part matches, so a
// first name shared with another member ("@ben" + "@ben") would notify
// both — use the (unique) email local part in that case instead.
function insertHandleFor(m: Member, members: Member[]): string {
  const h = handleFor(m);
  const shared = members.some(
    (o) => o.user_id !== m.user_id && handleFor(o) === h,
  );
  return (shared && emailHandleFor(m)) || h;
}

// What a typed @-prefix can match: every word of the name plus the email
// local part, so "@wang" finds "Jiayi Wang" and "@joy" finds joy.j…@….
function searchTokensFor(m: Member): string[] {
  const words = (m.display_name ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const emailLocal = (m.email ?? "").split("@", 1)[0]?.toLowerCase() ?? "";
  return emailLocal ? [...words, emailLocal] : words;
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
    {
      value,
      onChange,
      members,
      placeholder,
      rows = 3,
      maxLength,
      className,
      onKeyDown,
      onPaste,
      onDrop,
      onDragOver,
      onDragLeave,
    },
    ref,
  ) {
    const localRef = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => localRef.current!, []);

    const [mention, setMention] = useState<{ start: number; prefix: string } | null>(null);
    const [highlighted, setHighlighted] = useState(0);
    // `top` when the list opens below the textarea, `bottom` when it flips
    // above (not enough room below — the comment box often sits at the
    // bottom of the viewport).
    const [pos, setPos] = useState<{
      left: number;
      width: number;
      top?: number;
      bottom?: number;
    }>({ left: 0, width: 0, top: 0 });

    // Candidates: every member with a word of their name or their email
    // handle starting with the typed prefix — all of them, the list scrolls.
    // Members whose @-handle itself matches sort first. Picking one still
    // inserts their handle (first name word / email local part), which is
    // what the backend matches mentions on.
    const candidates = useMemo(() => {
      if (!mention) return [];
      const p = mention.prefix.toLowerCase();
      return members
        .map((m) => ({ m, h: handleFor(m) }))
        .filter(
          ({ m, h }) =>
            h && (p === "" || searchTokensFor(m).some((t) => t.startsWith(p))),
        )
        .sort((a, b) => Number(!a.h.startsWith(p)) - Number(!b.h.startsWith(p)));
    }, [mention, members]);
    const listRef = useRef<HTMLDivElement>(null);

    // Reset highlighted row whenever the candidate list changes shape.
    useEffect(() => {
      setHighlighted(0);
    }, [mention?.prefix]);

    // Keep the keyboard-highlighted row visible in the scrolling list.
    useEffect(() => {
      listRef.current
        ?.querySelector<HTMLElement>(`[data-index="${highlighted}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }, [highlighted]);

    // Anchor the dropdown below the textarea each time it opens.
    useEffect(() => {
      if (!mention) return;
      const el = localRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const LIST_MAX_H = 256; // matches max-h-64
      const below = window.innerHeight - r.bottom;
      if (below < LIST_MAX_H + 8 && r.top > below) {
        setPos({ left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4 });
      } else {
        setPos({ left: r.left, width: r.width, top: r.bottom + 4 });
      }
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
      const handle = insertHandleFor(member, members);
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
          onPaste={onPaste}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          placeholder={placeholder}
          rows={rows}
          maxLength={maxLength}
          className={className}
        />
        {mention &&
          candidates.length > 0 &&
          createPortal(
            <div
              ref={listRef}
              style={{
                position: "fixed",
                left: pos.left,
                top: pos.top,
                bottom: pos.bottom,
                width: Math.min(pos.width, 300),
              }}
              className="z-50 max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xl py-1"
            >
              {candidates.map(({ m }, i) => (
                <button
                  key={m.user_id}
                  data-index={i}
                  type="button"
                  // Use mousedown not click — textarea's onBlur fires before
                  // click would, and we'd lose the selection state.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(m);
                  }}
                  onMouseEnter={() => setHighlighted(i)}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${
                    i === highlighted ? "bg-slate-100 dark:bg-neutral-800" : "hover:bg-slate-50 dark:hover:bg-neutral-800/50"
                  }`}
                >
                  <Avatar
                    displayName={m.display_name}
                    email={m.email}
                    avatarUrl={m.avatar_url}
                    color={m.avatar_color}
                    size={24}
                    className="shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-slate-900 dark:text-neutral-200">
                      {m.display_name?.trim() || m.email}
                    </span>
                    {m.display_name?.trim() && m.email && (
                      <span className="block truncate text-xs text-slate-400 dark:text-neutral-500">
                        {m.email}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>,
            document.body,
          )}
      </>
    );
  },
);
