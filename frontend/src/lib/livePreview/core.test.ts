// @vitest-environment jsdom
// Ported from commonplace (web/src/lib/livePreview.test.ts).
// Live Preview decorations, computed over an EditorState (no layout needed):
// the active line shows raw syntax, the others hide the marks and style.
import { EditorSelection, EditorState } from "@codemirror/state";
import type { Decoration } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { activeLines, buildDecorations, enterMarkup, linkAt, markdownLanguage, openableUrl, parseAll } from "./core";

function stateOf(doc: string, selection?: EditorSelection) {
  const state = EditorState.create({ doc, selection, extensions: [markdownLanguage, EditorState.lineSeparator.of("\n")] });
  parseAll(state);
  return state;
}

type Found = { lines: Map<number, string[]>; marks: { from: number; to: number; cls: string }[]; hidden: { from: number; to: number }[]; widgets: { from: number; to: number; cls: string }[] };

/** Every decoration of `doc` with `active` lines raw, sorted by kind. */
function decorate(doc: string, active: number[] = []): Found & { shown: string } {
  const state = stateOf(doc);
  const set = buildDecorations(state, [{ from: 0, to: doc.length }], new Set(active));
  const f: Found = { lines: new Map(), marks: [], hidden: [], widgets: [] };
  set.between(0, doc.length, (from, to, d: Decoration) => {
    const spec = d.spec as { class?: string; widget?: { toDOM: () => HTMLElement; constructor: { name: string } } };
    if (spec.widget) f.widgets.push({ from, to, cls: spec.widget.constructor.name });
    else if (spec.class && from === to) {
      const n = state.doc.lineAt(from).number;
      f.lines.set(n, [...(f.lines.get(n) ?? []), spec.class]);
    } else if (spec.class) f.marks.push({ from, to, cls: spec.class });
    else f.hidden.push({ from, to });
  });
  // What the reader sees: hidden ranges dropped, widgets as their text (or a tag).
  const cuts = [...f.hidden.map((h) => ({ ...h, text: "" })), ...f.widgets.map((w) => ({ from: w.from, to: w.to, text: `<${w.cls}>` }))].sort((a, b) => a.from - b.from);
  let shown = "";
  let at = 0;
  for (const c of cuts) {
    shown += doc.slice(at, c.from) + c.text;
    at = c.to;
  }
  shown += doc.slice(at);
  return { ...f, shown };
}
const markText = (doc: string, f: Found, cls: string) => f.marks.filter((m) => m.cls === cls).map((m) => doc.slice(m.from, m.to));

describe("activeLines", () => {
  it("the cursor's line, every line a selection covers, none when unfocused", () => {
    const doc = "a\nb\nc\nd";
    expect([...activeLines(stateOf(doc, EditorSelection.single(2)))]).toEqual([2]);
    expect([...activeLines(stateOf(doc, EditorSelection.single(1, 5)))]).toEqual([1, 2, 3]);
    expect(activeLines(stateOf(doc, EditorSelection.single(2)), false).size).toBe(0);
  });
});

describe("buildDecorations", () => {
  it("bold: ** and __ hidden, the text bold; on the active line the marks show but the bold stays", () => {
    const doc = "a **bold** and __also__ here";
    const off = decorate(doc);
    expect(off.shown).toBe("a bold and also here");
    expect(markText(doc, off, "cm-lp-strong")).toEqual(["**bold**", "__also__"]);
    const on = decorate(doc, [1]);
    expect(on.shown).toBe(doc);
    expect(markText(doc, on, "cm-lp-strong")).toEqual(["**bold**", "__also__"]);
  });

  it("italic, strikethrough, inline code", () => {
    const doc = "*em* _em2_ ~~gone~~ `x = 1`";
    const f = decorate(doc);
    expect(f.shown).toBe("em em2 gone x = 1");
    expect(markText(doc, f, "cm-lp-em")).toEqual(["*em*", "_em2_"]);
    expect(markText(doc, f, "cm-lp-strike")).toEqual(["~~gone~~"]);
    expect(markText(doc, f, "cm-lp-code")).toEqual(["`x = 1`"]);
    expect(decorate(doc, [1]).shown).toBe(doc);
  });

  it("headings # to ####: marks and the space hidden, the line sized; ##### stays raw", () => {
    const doc = "# One\n## Two ##\n### Three\n#### Four\n##### Five";
    const f = decorate(doc);
    expect(f.shown).toBe("One\nTwo\nThree\nFour\n##### Five");
    expect([...f.lines]).toEqual([
      [1, ["cm-lp-h1"]],
      [2, ["cm-lp-h2"]],
      [3, ["cm-lp-h3"]],
      [4, ["cm-lp-h4"]],
    ]);
    const on = decorate(doc, [2]);
    expect(on.shown).toBe("One\n## Two ##\nThree\nFour\n##### Five");
    expect(on.lines.get(2)).toEqual(["cm-lp-h2"]); // still sized while editing it
  });

  it("lists: - and * become a dash; 1. stays; tasks become a checkbox look", () => {
    const doc = "- one\n* two\n\n1. first\n\n- [ ] todo\n- [x] done";
    const f = decorate(doc);
    expect(f.shown).toBe("<BulletWidget> one\n<BulletWidget> two\n\n1. first\n\n<TaskWidget> todo\n<TaskWidget> done");
    const tasks = decorate(doc).widgets.filter((w) => w.cls === "TaskWidget");
    expect(tasks.map((t) => doc.slice(t.from, t.to))).toEqual(["[ ]", "[x]"]);
    expect(decorate(doc, [1, 2, 6]).shown).toBe("- one\n* two\n\n1. first\n\n- [ ] todo\n<TaskWidget> done");
  });

  it("the checkbox look is a span, never an input", () => {
    const state = stateOf("- [x] done");
    const set = buildDecorations(state, [{ from: 0, to: state.doc.length }], new Set());
    const doms: HTMLElement[] = [];
    set.between(0, state.doc.length, (_f, _t, d) => {
      const w = (d.spec as { widget?: { toDOM: () => HTMLElement } }).widget;
      if (w) doms.push(w.toDOM());
    });
    expect(doms.map((d) => d.tagName)).toEqual(["SPAN"]);
    expect(doms[0].className).toBe("cm-lp-task cm-lp-task-done");
  });

  it("blockquote: > hidden, a quote line style on each line", () => {
    const doc = "> said\n> more\n\nafter";
    const f = decorate(doc);
    expect(f.shown).toBe("said\nmore\n\nafter");
    expect(f.lines.get(1)).toEqual(["cm-lp-quote"]);
    expect(f.lines.get(2)).toEqual(["cm-lp-quote"]);
    expect(f.lines.get(4)).toBeUndefined();
    expect(decorate(doc, [1]).shown).toBe("> said\nmore\n\nafter");
  });

  it("links: only the text, underlined, the url hidden; a bare url only styled", () => {
    const doc = "See [the site](https://evil.test/x \"t\") or [ref][r] and https://evil.test/y\n\n[r]: https://evil.test/r";
    const f = decorate(doc);
    expect(f.shown).toBe("See the site or ref and https://evil.test/y\n\n[r]: https://evil.test/r");
    expect(markText(doc, f, "cm-lp-link")).toEqual(["the site", "ref"]);
    expect(markText(doc, f, "cm-lp-url")).toEqual(["https://evil.test/y", "https://evil.test/r"]); // a definition's url too
    expect(decorate(doc, [1]).shown).toBe(doc);
    // A lone [text] is no link without a definition: left as typed.
    const lone = decorate("a [note] here");
    expect(lone.shown).toBe("a [note] here");
    expect(lone.marks).toEqual([]);
  });

  it("images: an ImageWidget carrying src and alt; raw on the active line", () => {
    const doc = "Shot ![shot](task-image:a/b.png) end";
    const f = decorate(doc);
    expect(f.widgets.map((w) => [w.cls, doc.slice(w.from, w.to)])).toEqual([["ImageWidget", "![shot](task-image:a/b.png)"]]);
    const state = stateOf(doc);
    const set = buildDecorations(state, [{ from: 0, to: doc.length }], new Set());
    const widgets: { src: string; alt: string }[] = [];
    set.between(0, doc.length, (_f, _t, d) => {
      const w = (d.spec as { widget?: { src: string; alt: string } }).widget;
      if (w) widgets.push({ src: w.src, alt: w.alt });
    });
    expect(widgets).toEqual([{ src: "task-image:a/b.png", alt: "shot" }]);
    expect(decorate(doc, [1]).widgets).toEqual([]);
  });

  it("tables, code blocks and HTML stay raw; code blocks get the monospace line", () => {
    const doc = "| a | **b** |\n| - | - |\n| 1 | 2 |\n\n```js\nconst **x** = 1\n```\n\n<div>**raw**</div>\n\n    indented *code*";
    const f = decorate(doc);
    expect(f.shown).toBe(doc);
    expect(f.marks).toEqual([]);
    expect([...f.lines].filter(([, c]) => c.includes("cm-lp-codeblock")).map(([n]) => n)).toEqual([5, 6, 7, 11]);
  });

  it("only the given ranges are walked", () => {
    const doc = "**a**\n\n" + "plain\n".repeat(50) + "**z**";
    const state = stateOf(doc);
    const set = buildDecorations(state, [{ from: 0, to: 10 }], new Set());
    const at: number[] = [];
    set.between(0, doc.length, (from) => void at.push(from));
    expect(at.every((p) => p < 10)).toBe(true);
    expect(at.length).toBeGreaterThan(0);
  });
});

/** Runs a command on `doc` with the cursor at "|" (or a selection between two "|"). */
function exec(cmd: typeof enterMarkup, marked: string) {
  const at = [...marked.matchAll(/\|/g)].map((m, i) => m.index! - i);
  const doc = marked.replace(/\|/g, "");
  let state = stateOf(doc, EditorSelection.single(at[0], at[1] ?? at[0]));
  cmd({ state, dispatch: (tr) => (state = tr.state) });
  const r = state.selection.main;
  const text = state.doc.toString();
  return r.empty ? text.slice(0, r.head) + "|" + text.slice(r.head) : text.slice(0, r.from) + "|" + text.slice(r.from, r.to) + "|" + text.slice(r.to);
}

describe("enterMarkup (Enter)", () => {
  it("a plain newline elsewhere: nothing after the cursor or on blank lines is touched", () => {
    expect(exec(enterMarkup, "a| b")).toBe("a\n| b");
    expect(exec(enterMarkup, "[|](url)")).toBe("[\n|](url)");
    expect(exec(enterMarkup, "x\n   |\ny")).toBe("x\n   \n|\ny"); // a whitespace-only line keeps its spaces
    expect(exec(enterMarkup, "    indented| text")).toBe("    indented\n| text");
    expect(exec(enterMarkup, "a |sel| b")).toBe("a \n| b");
  });
  it("continues - * + and task items with the same prefix (a task unticked)", () => {
    expect(exec(enterMarkup, "- one|")).toBe("- one\n- |");
    expect(exec(enterMarkup, "* one|")).toBe("* one\n* |");
    expect(exec(enterMarkup, "  + nested|")).toBe("  + nested\n  + |");
    expect(exec(enterMarkup, "- [x] done|")).toBe("- [x] done\n- [ ] |");
    expect(exec(enterMarkup, "- [ ] to|do")).toBe("- [ ] to\n- [ ] |do"); // the rest moves down, unchanged
  });
  it("numbers go up by one; the items below are left as they are", () => {
    expect(exec(enterMarkup, "1. first|\n2. second")).toBe("1. first\n2. |\n2. second");
    expect(exec(enterMarkup, "9) nine|")).toBe("9) nine\n10) |");
  });
  it("continues quotes, also a list inside a quote", () => {
    expect(exec(enterMarkup, "> said|")).toBe("> said\n> |");
    expect(exec(enterMarkup, "> - item|")).toBe("> - item\n> - |");
  });
  it("Enter on an item that is only its prefix removes it and ends the list", () => {
    expect(exec(enterMarkup, "- one\n- |")).toBe("- one\n|");
    expect(exec(enterMarkup, "1. one\n2. |")).toBe("1. one\n|");
    expect(exec(enterMarkup, "- [ ] |")).toBe("|");
    expect(exec(enterMarkup, "> |")).toBe("|");
  });
  it("plain inside code, tables, rules, or with the cursor inside the prefix; **bold** is no list", () => {
    expect(exec(enterMarkup, "```\n- code|\n```")).toBe("```\n- code\n|\n```");
    expect(exec(enterMarkup, "* * *|")).toBe("* * *\n|");
    expect(exec(enterMarkup, "-| item")).toBe("-\n| item");
    expect(exec(enterMarkup, "**bold**|")).toBe("**bold**\n|");
    expect(exec(enterMarkup, "1.5 million|")).toBe("1.5 million\n|");
  });
  it("adds only the newline and prefix: the rest of the document is byte for byte the same", () => {
    const before = "# T\n\n- a\n- b|c\n\ntail  \r\n";
    const out = exec(enterMarkup, before).replace("|", "");
    expect(out).toBe(before.replace("|", "\n- "));
  });
});

describe("linkAt", () => {
  it("the url of a [text](url) link, a bare url, or null on plain text", () => {
    expect(linkAt(stateOf("see [a](https://x.y) end"), 6)).toBe("https://x.y");
    expect(linkAt(stateOf("go https://x.y now"), 5)).toBe("https://x.y");
    expect(linkAt(stateOf("plain text"), 3)).toBeNull();
  });
});

describe("openableUrl", () => {
  it("only http(s) and mailto links open; javascript: and data: never do", () => {
    expect(openableUrl("https://x.y/a")).toBe("https://x.y/a");
    expect(openableUrl("mailto:a@b.c")).toBe("mailto:a@b.c");
    expect(openableUrl("javascript:alert(1)")).toBeNull();
    expect(openableUrl(" JavaScript:alert(1)")).toBeNull();
    expect(openableUrl("data:text/html,<b>x</b>")).toBeNull();
    expect(openableUrl("task-image:a/b.png")).toBeNull();
  });
});
