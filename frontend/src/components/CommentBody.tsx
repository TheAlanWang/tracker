// CommentBody — renders a comment's markdown body and turns recognised
// `@handle` tokens into highlighted chips. Mention recognition is intentionally
// non-strict: any `@<word>` that matches a workspace member's handle (display
// name first word OR email local part, case-insensitive) is highlighted; the
// rest stay as literal text. This matches the backend's parser, so what the
// reader sees as a "real" mention is the same set that triggers notifications.
//
// We hook into ReactMarkdown via a custom `p` component override and walk its
// children. Doing this at the markdown component layer (rather than mutating
// the raw string) means existing markdown formatting — code blocks, links,
// emphasis — keeps working untouched; we only transform plain text nodes.

import { Fragment } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

import type { Member } from "@/features/members/api";

const MENTION_RE = /@([A-Za-z0-9._-]+)/g;

function handleFor(m: Member): string {
  const name = (m.display_name ?? "").trim();
  if (name) return name.split(/\s+/)[0]!.toLowerCase();
  return (m.email ?? "").split("@", 1)[0]?.toLowerCase() ?? "";
}

function highlightText(text: string, handles: Set<string>) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(MENTION_RE)) {
    const [whole, h] = match;
    const start = match.index ?? 0;
    if (!handles.has(h!.toLowerCase())) continue;
    if (start > last) out.push(text.slice(last, start));
    out.push(
      <span
        key={`${start}-${h}`}
        className="rounded bg-blue-50 text-blue-700 px-1 font-medium"
      >
        {whole}
      </span>,
    );
    last = start + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length === 0 ? [text] : out;
}

export function CommentBody({
  body,
  members,
}: {
  body: string;
  members: Member[];
}) {
  const handles = new Set(
    members.map(handleFor).filter((h): h is string => !!h),
  );

  return (
    <div className="prose prose-sm max-w-none prose-pre:bg-slate-100 dark:prose-pre:bg-slate-800/60 prose-pre:text-slate-800 dark:prose-pre:text-slate-200 prose-pre:rounded-md prose-pre:p-3 prose-pre:text-[13px] prose-code:bg-slate-100 dark:prose-code:bg-slate-800/60 prose-code:text-slate-800 dark:prose-code:text-slate-200 prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-normal prose-code:before:hidden prose-code:after:hidden">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Only transform plain text inside paragraphs. Other nodes
          // (links, code, list items) fall through to react-markdown's
          // defaults — we don't want to break code blocks that happen to
          // contain `@foo`.
          p({ children }) {
            return (
              <p>
                {Array.isArray(children)
                  ? children.map((c, i) =>
                      typeof c === "string" ? (
                        <Fragment key={i}>{highlightText(c, handles)}</Fragment>
                      ) : (
                        <Fragment key={i}>{c}</Fragment>
                      ),
                    )
                  : typeof children === "string"
                    ? highlightText(children, handles)
                    : children}
              </p>
            );
          },
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
