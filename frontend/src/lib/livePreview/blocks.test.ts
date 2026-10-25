// @vitest-environment jsdom
// Block-level live preview (tables rendered, code fences hidden), computed
// over an EditorState: the block the selection is in shows its raw Markdown.
import { EditorSelection, EditorState } from "@codemirror/state";
import type { Decoration } from "@codemirror/view";
import { describe, expect, it } from "vitest";

import { blockField, buildBlockDecorations, setFocused } from "./blocks";
import { markdownLanguage, parseAll } from "./core";

function stateOf(doc: string, selection?: EditorSelection) {
  const state = EditorState.create({ doc, selection, extensions: [markdownLanguage, EditorState.lineSeparator.of("\n")] });
  parseAll(state);
  return state;
}

function found(doc: string, active: number[] = []) {
  const state = stateOf(doc);
  const set = buildBlockDecorations(state, new Set(active));
  const out: { from: number; to: number; widget?: string; text: string }[] = [];
  set.between(0, doc.length, (from, to, d: Decoration) => {
    const w = (d.spec as { widget?: { constructor: { name: string } } }).widget;
    out.push({ from, to, widget: w?.constructor.name, text: doc.slice(from, to) });
  });
  return out;
}

const TABLE = "| a | **b** |\n| - | - |\n| 1 | 2 |";

describe("buildBlockDecorations", () => {
  it("table outside selection → one block widget covering the table", () => {
    const doc = "before\n\n" + TABLE + "\n\nafter";
    expect(found(doc)).toEqual([{ from: 8, to: 8 + TABLE.length, widget: "TableWidget", text: TABLE }]);
  });

  it("cursor inside table → no widget", () => {
    const doc = "before\n\n" + TABLE + "\n\nafter";
    expect(found(doc, [4])).toEqual([]);
  });

  it("fenced code outside selection → open and close fence lines hidden", () => {
    const doc = "x\n```js\nconst a = 1\n```\ny";
    const f = found(doc);
    expect(f.map((r) => r.text)).toEqual(["```js\n", "\n```"]);
    expect(f.every((r) => r.widget === undefined)).toBe(true);
  });

  it("an empty fenced block hides as one range", () => {
    expect(found("```\n```").map((r) => r.text)).toEqual(["```\n```"]);
  });

  it("cursor in code → nothing hidden", () => {
    expect(found("x\n```js\nconst a = 1\n```\ny", [3])).toEqual([]);
  });
});

describe("blockField", () => {
  const doc = "intro line\n\n" + TABLE + "\n\nouter text";
  function focusedState(pos: number) {
    let s = EditorState.create({ doc, selection: EditorSelection.single(pos), extensions: [markdownLanguage, blockField] });
    parseAll(s);
    s = s.update({ effects: setFocused.of(true) }).state;
    return s;
  }

  it("table field ignores selection-only updates outside tables", () => {
    const s1 = focusedState(1);
    const s2 = s1.update({ selection: EditorSelection.single(3) }).state;
    expect(s2.field(blockField)).toBe(s1.field(blockField));
  });

  it("moving the cursor into the table rebuilds it raw; blur renders it again", () => {
    const s1 = focusedState(1);
    const inTable = s1.update({ selection: EditorSelection.single(14) }).state;
    expect(inTable.field(blockField).deco.size).toBe(0);
    const blurred = inTable.update({ effects: setFocused.of(false) }).state;
    expect(blurred.field(blockField).deco.size).toBe(1);
  });
});
