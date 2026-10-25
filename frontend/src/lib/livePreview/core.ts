// Live Preview core, ported from commonplace (web/src/lib/livePreview.ts):
// the Markdown renders in place, and the line(s) under the cursor or
// selection show the raw syntax. Only decorations: the document is never
// changed, so what is saved is exactly what was typed.
//
// The ranges come from the @lezer/markdown syntax tree, not from regexes, and
// only the visible ranges are walked. The pure parts (activeLines,
// buildDecorations) take an EditorState and are tested without a layout.
//
// Rules, on a line that isn't active:
// - **bold** / __bold__, *em* / _em_, ~~strike~~, `code`: styled, marks hidden.
// - # .. ####: "# " hidden, the line sized like .prose headings.
// - "- " / "* " list marks drawn as a dash; "1." stays; "- [ ]" / "- [x]" a
//   checkbox look (a span, nothing to click).
// - "> ": hidden, a rule on the left, muted text.
// - [text](url): only "text", underlined; the url hidden. Cmd/Ctrl+click
//   opens it (LiveMarkdownEditor, via linkAt). A bare url is only styled.
// - ![alt](src): the real image (./widgets ImageWidget).
// Tables and code fences are drawn by ./blocks; here they are left alone
// (code blocks only get their monospace line style).
// Styles (bold, heading size, ...) stay on the active line too, so the text
// doesn't jump when the cursor arrives; only the marks come back.

import { defineLanguageFacet, ensureSyntaxTree, Language, languageDataProp, syntaxTree } from "@codemirror/language";
import { EditorSelection, type EditorState, type Range, type StateCommand } from "@codemirror/state";
import { Decoration, type DecorationSet, type EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { GFM, parser } from "@lezer/markdown";

import { ImageWidget } from "./widgets";

const data = defineLanguageFacet({});
/** CommonMark + GFM (tables, task lists, strikethrough, bare urls). No nested languages: code stays plain text. */
export const markdownLanguage = new Language(data, parser.configure([GFM, { props: [languageDataProp.add({ Document: data })] }]), [], "markdown");

/** Line numbers (1-based) the selection touches; none while the editor isn't focused. */
export function activeLines(state: EditorState, focused = true): Set<number> {
  const lines = new Set<number>();
  if (!focused) return lines;
  for (const r of state.selection.ranges) {
    const a = state.doc.lineAt(r.from).number;
    const b = state.doc.lineAt(r.to).number;
    for (let n = a; n <= b; n++) lines.add(n);
  }
  return lines;
}

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-lp-bullet";
    s.setAttribute("aria-hidden", "true");
    return s;
  }
  ignoreEvent() {
    return false; // a click places the cursor (and shows the raw mark)
  }
}

class TaskWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(o: TaskWidget) {
    return o.checked === this.checked;
  }
  toDOM() {
    // A look, not a control: a span, so there is nothing to tick by accident.
    const s = document.createElement("span");
    s.className = "cm-lp-task" + (this.checked ? " cm-lp-task-done" : "");
    s.setAttribute("aria-hidden", "true");
    return s;
  }
  ignoreEvent() {
    return false;
  }
}

const hide = Decoration.replace({});
const mark = (cls: string) => Decoration.mark({ class: cls });
const strong = mark("cm-lp-strong");
const em = mark("cm-lp-em");
const strike = mark("cm-lp-strike");
const code = mark("cm-lp-code");
const linkText = mark("cm-lp-link");
const url = mark("cm-lp-url");
const lineDeco = (cls: string) => Decoration.line({ class: cls });
const headingLine = [1, 2, 3, 4].map((n) => lineDeco(`cm-lp-h${n}`));
const quoteLine = lineDeco("cm-lp-quote");
const codeLine = lineDeco("cm-lp-codeblock");

const STYLE: Record<string, Decoration> = { StrongEmphasis: strong, Emphasis: em, Strikethrough: strike, InlineCode: code };
const MARKS: Record<string, string> = { StrongEmphasis: "EmphasisMark", Emphasis: "EmphasisMark", Strikethrough: "StrikethroughMark", InlineCode: "CodeMark" };

/**
 * The Live Preview decorations for `ranges` (the visible ones; the whole
 * document in tests). `active`: the line numbers that show raw syntax.
 * Pure over the state and its syntax tree.
 */
export function buildDecorations(state: EditorState, ranges: readonly { from: number; to: number }[], active: Set<number>): DecorationSet {
  const doc = state.doc;
  const tree = syntaxTree(state);
  const out: Range<Decoration>[] = [];
  const lineDone = new Set<string>(); // "line:class", so overlapping ranges add a line class once
  const lineOf = (pos: number) => doc.lineAt(pos).number;
  /** Raw when any line of [from, to] is active. */
  const isActive = (from: number, to: number) => {
    for (let n = lineOf(from), e = lineOf(to); n <= e; n++) if (active.has(n)) return true;
    return false;
  };
  const oneLine = (from: number, to: number) => lineOf(from) === lineOf(to);
  const hideRange = (from: number, to: number) => {
    // Only within a line: a plugin may not replace line breaks.
    if (to > from && oneLine(from, to)) out.push(hide.range(from, to));
  };
  const lines = (from: number, to: number, deco: Decoration, key: string, lo: number, hi: number) => {
    for (let n = lineOf(Math.max(from, lo)), e = lineOf(Math.min(to, hi)); n <= e; n++) {
      const k = n + ":" + key;
      if (lineDone.has(k)) continue;
      lineDone.add(k);
      out.push(deco.range(doc.line(n).from));
    }
  };
  /** Past spaces after `pos`, on the same line. */
  const spacesAfter = (pos: number) => {
    const end = doc.lineAt(pos).to;
    while (pos < end && doc.sliceString(pos, pos + 1) === " ") pos++;
    return pos;
  };
  const kids = (node: SyntaxNode, name: string) => {
    const r: SyntaxNode[] = [];
    for (let c = node.firstChild; c; c = c.nextSibling) if (c.name === name) r.push(c);
    return r;
  };

  for (const { from, to } of ranges) {
    tree.iterate({
      from,
      to,
      enter: (ref) => {
        const name = ref.name;
        const node = ref.node;
        // Tables, HTML, code: left to ./blocks. Code blocks get the monospace line style.
        if (name === "Table" || name === "HTMLBlock" || name === "CommentBlock" || name === "ProcessingInstructionBlock") return false;
        if (name === "FencedCode" || name === "CodeBlock") {
          lines(node.from, node.to, codeLine, "code", from, to);
          return false;
        }
        const h = /^ATXHeading([1-6])$/.exec(name);
        if (h) {
          const level = Number(h[1]);
          if (level > 4) return; // #####, ######: raw, like any unstyled line
          lines(node.from, node.from, headingLine[level - 1], "h", from, to);
          if (!isActive(node.from, node.to)) {
            for (const m of kids(node, "HeaderMark")) {
              if (m.from === node.from) hideRange(m.from, spacesAfter(m.to));
              else {
                // A closing "##": hide it with the spaces before it.
                let s = m.from;
                while (s > node.from && doc.sliceString(s - 1, s) === " ") s--;
                hideRange(s, m.to);
              }
            }
          }
          return;
        }
        if (STYLE[name]) {
          out.push(STYLE[name].range(node.from, node.to));
          if (!isActive(node.from, node.to)) for (const m of kids(node, MARKS[name])) hideRange(m.from, m.to);
          return;
        }
        if (name === "Blockquote") {
          lines(node.from, node.to, quoteLine, "quote", from, to);
          return;
        }
        if (name === "QuoteMark") {
          if (!isActive(node.from, node.to)) hideRange(node.from, Math.min(node.to + 1, spacesAfter(node.to)));
          return;
        }
        if (name === "ListMark") {
          const item = node.parent;
          if (!item || item.parent?.name !== "BulletList" || isActive(node.from, node.to)) return;
          const task = item.getChild("Task");
          if (task && task.from === spacesAfter(node.to)) {
            hideRange(node.from, task.from); // the checkbox stands for the dash
            return;
          }
          out.push(Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to));
          return;
        }
        if (name === "TaskMarker") {
          if (isActive(node.from, node.to)) return;
          const checked = /x/i.test(doc.sliceString(node.from, node.to));
          out.push(Decoration.replace({ widget: new TaskWidget(checked) }).range(node.from, node.to));
          return;
        }
        if (name === "Image") {
          if (!isActive(node.from, node.to) && oneLine(node.from, node.to)) {
            const [open, close] = kids(node, "LinkMark");
            const alt = open && close ? doc.sliceString(open.to, close.from) : "";
            const src = node.getChild("URL");
            out.push(Decoration.replace({ widget: new ImageWidget(src ? doc.sliceString(src.from, src.to) : "", alt) }).range(node.from, node.to));
          }
          return false;
        }
        if (name === "Link") {
          const marks = kids(node, "LinkMark");
          const [open, close] = marks;
          if (!open || !close || open.from !== node.from) return; // not "[text]..."
          // Only "[text](url)" and "[text][ref]": a lone "[text]" stays as typed (it is
          // only a link when a definition exists, which we don't look up).
          if (marks.length < 3 && !node.getChild("LinkLabel")) return;
          if (close.from > open.to) out.push(linkText.range(open.to, close.from));
          if (!isActive(node.from, node.to)) {
            hideRange(open.from, open.to);
            hideRange(close.from, node.to); // "](url)" or "][ref]"
          }
          return;
        }
        if (name === "URL" || name === "Autolink") {
          // A bare url (or <url>) outside a link: styled only.
          if (node.parent?.name !== "Link" && node.parent?.name !== "Image") out.push(url.range(node.from, node.to));
          return name === "Autolink" ? false : undefined;
        }
      },
    });
  }
  return Decoration.set(out, true);
}

/** The decorations' view plugin (exported for tests). */
export const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    /** Decorations were only mapped during an IME composition; rebuild once it ends. */
    held = false;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    build(view: EditorView) {
      return buildDecorations(view.state, view.visibleRanges, activeLines(view.state, view.hasFocus));
    }
    update(u: ViewUpdate) {
      // While the IME composes, don't redraw around its text (that can drop
      // or duplicate characters): only map through the changes.
      if (u.view.compositionStarted) {
        this.decorations = this.decorations.map(u.changes);
        this.held = true;
        return;
      }
      if (
        this.held ||
        u.docChanged ||
        u.viewportChanged ||
        u.selectionSet ||
        u.focusChanged ||
        syntaxTree(u.startState) !== syntaxTree(u.state)
      ) {
        this.held = false;
        this.decorations = this.build(u.view);
      }
    }
  },
  // No dispatch of our own when the composition ends (it could race the
  // DOM read of the composed text): CodeMirror's own follow-up update (the
  // composed change, or its clean-up redraw) comes through update() above.
  { decorations: (p) => p.decorations },
);

/** Parses the whole document now (tests; a short one in the editor). */
export function parseAll(state: EditorState, timeout = 1000) {
  return ensureSyntaxTree(state, state.doc.length, timeout);
}

/** The link target under `pos`: a [text](url) link's url, or a bare / <autolink> url. */
export function linkAt(state: EditorState, pos: number): string | null {
  const tree = ensureSyntaxTree(state, pos, 50) ?? syntaxTree(state);
  for (let n: SyntaxNode | null = tree.resolveInner(pos, 1); n; n = n.parent) {
    if (n.name === "URL" || n.name === "Autolink") return state.doc.sliceString(n.from, n.to).replace(/^<|>$/g, "");
    if (n.name === "Link") {
      const u = n.getChild("URL");
      return u ? state.doc.sliceString(u.from, u.to) : null;
    }
  }
  return null;
}

/**
 * The URL to open for a Cmd/Ctrl+click, or null. Descriptions are written by
 * other members and AI agents, so only http(s) and mailto open — never
 * javascript:, data: or anything else.
 */
export function openableUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? parsed.href : null;
}

/** Indent, quote marks, then a list mark ("- ", "* ", "+ ", "1. ", "1) ", with an optional "[ ] "). */
const PREFIX = /^([ \t]*)((?:>[ \t]?)*)(?:([ \t]*)(?:([-*+])|(\d{1,9})([.)]))([ \t]+)(\[[ xX]\](?:[ \t]+|$))?)?/;

/** Inside code, HTML, a table or a rule ("* * *"): Enter is a plain newline there. */
function noMarkup(state: EditorState, pos: number) {
  const tree = ensureSyntaxTree(state, pos, 50) ?? syntaxTree(state);
  for (let n: SyntaxNode | null = tree.resolveInner(pos, -1); n; n = n.parent) {
    if (/^(FencedCode|CodeBlock|HTMLBlock|CommentBlock|Table|HorizontalRule)$/.test(n.name)) return true;
  }
  return false;
}

/**
 * Enter, Obsidian style. On a list item or quote line ("- ", "* ", "1. ",
 * "- [ ] ", "> ", nested in quotes or indented), a newline plus the same
 * prefix: the number goes up by one, a task starts unticked. On an item that
 * is only its prefix, the prefix is removed and the list ends. Everywhere
 * else (and with a selection, or inside code) a plain newline. Existing text
 * is never removed or re-indented: only the newline and prefix are added.
 */
export const enterMarkup: StateCommand = ({ state, dispatch }) => {
  const tr = state.changeByRange((r) => {
    const line = state.doc.lineAt(r.from);
    const plain = { changes: { from: r.from, to: r.to, insert: "\n" }, range: EditorSelection.cursor(r.from + 1) };
    if (!r.empty || noMarkup(state, r.from)) return plain;
    const m = PREFIX.exec(line.text);
    if (!m) return plain;
    const [prefix, indent, quotes, inner = "", bullet, num, delim, gap, task] = m;
    const isList = bullet !== undefined || num !== undefined;
    if (!quotes && !isList) return plain; // indentation alone isn't markup
    if (r.from - line.from < prefix.length) return plain; // the cursor is inside the prefix
    if (line.text.slice(prefix.length).trim() === "") {
      // Only the prefix: end the list / quote. The prefix goes, nothing is added.
      return { changes: { from: line.from, to: line.from + prefix.length }, range: EditorSelection.cursor(r.from - prefix.length) };
    }
    let next = indent + quotes;
    if (isList) {
      const mark = bullet ?? String(Number(num) + 1) + delim;
      next += inner + mark + gap + (task ? "[ ] " : "");
    }
    const insert = "\n" + next;
    return { changes: { from: r.from, insert }, range: EditorSelection.cursor(r.from + insert.length) };
  });
  dispatch(state.update(tr, { scrollIntoView: true, userEvent: "input" }));
  return true;
};
