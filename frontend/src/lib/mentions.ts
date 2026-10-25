// @-mentions of workspace members, for the live Markdown editor's
// autocomplete (moved here from the old MentionTextarea). Picking a member
// replaces the typed `@<prefix>` with `@<handle>`, the token shape the
// backend parses to fire `mentioned` notifications (comments only).

import type { Completion, CompletionSource } from "@codemirror/autocomplete";

import type { Member } from "@/features/members/api";

// Derive the @-handle a member should be addressed by: prefer display_name's
// first word, fall back to email local part. Lowercased so we can match
// case-insensitively on the user's typed prefix.
export function handleFor(m: Member): string {
  const name = (m.display_name ?? "").trim();
  if (name) return name.split(/\s+/)[0]!.toLowerCase();
  return emailHandleFor(m);
}

export function emailHandleFor(m: Member): string {
  return (m.email ?? "").split("@", 1)[0]?.toLowerCase() ?? "";
}

// The token actually inserted for a picked member. The backend notifies
// everyone whose first-name handle OR email local part matches, so a
// first name shared with another member ("@ben" + "@ben") would notify
// both — use the (unique) email local part in that case instead.
export function insertHandleFor(m: Member, members: Member[]): string {
  const h = handleFor(m);
  const shared = members.some(
    (o) => o.user_id !== m.user_id && handleFor(o) === h,
  );
  return (shared && emailHandleFor(m)) || h;
}

// What a typed @-prefix can match: every word of the name plus the email
// local part, so "@wang" finds "Jiayi Wang" and "@joy" finds joy.j…@….
export function searchTokensFor(m: Member): string[] {
  const words = (m.display_name ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const emailLocal = (m.email ?? "").split("@", 1)[0]?.toLowerCase() ?? "";
  return emailLocal ? [...words, emailLocal] : words;
}

/**
 * Completion source: active when the cursor ends an `@<prefix>` whose @ is at
 * the start of the text or after whitespace (so `foo@bar` emails don't
 * trigger). Candidates: every member with a word of their name or their email
 * handle starting with the prefix; members whose @-handle itself matches sort
 * first. CodeMirror's own fuzzy filter is off — this is the filter.
 */
export function mentionCompletion(members: Member[]): CompletionSource {
  return (ctx) => {
    const m = ctx.matchBefore(/(?:^|\s)@[A-Za-z0-9._-]*$/);
    if (!m) return null;
    const at = m.from + m.text.indexOf("@");
    const p = m.text.slice(m.text.indexOf("@") + 1).toLowerCase();
    const options: Completion[] = members
      .map((mb) => ({ mb, h: handleFor(mb) }))
      .filter(({ mb, h }) => h && (p === "" || searchTokensFor(mb).some((t) => t.startsWith(p))))
      .sort((a, b) => Number(!a.h.startsWith(p)) - Number(!b.h.startsWith(p)))
      .map(({ mb }) => ({
        label: mb.display_name?.trim() || mb.email || mb.user_id,
        detail: mb.email ?? undefined,
        apply: `@${insertHandleFor(mb, members)} `,
      }));
    return { from: at, options, filter: false };
  };
}
