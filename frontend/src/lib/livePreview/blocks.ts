// Block-level live preview: tables rendered as real tables, code fences
// hidden. These decorations span line breaks, which CodeMirror only accepts
// from a StateField (not from a view plugin like ./core), so they live here.
//
// A table or code block that the selection touches (while the editor has
// focus) shows its raw Markdown, like an active line in ./core. The field
// keeps its previous value when an update changes neither the document, the
// focus, nor which blocks are active, so moving the cursor through plain
// text never redraws the tables.

import { syntaxTree } from "@codemirror/language";
import { type EditorState, type Range, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

import { activeLines } from "./core";
import { TableWidget } from "./widgets";

/** Focus changes reach the field through this effect (EditorView.focusChangeEffect below). */
export const setFocused = StateEffect.define<boolean>();

type Block = { name: "Table" | "FencedCode"; from: number; to: number };

function blocks(state: EditorState): Block[] {
  const out: Block[] = [];
  syntaxTree(state).iterate({
    enter: (n) => {
      if (n.name === "Table" || n.name === "FencedCode") {
        out.push({ name: n.name, from: n.from, to: n.to });
        return false;
      }
    },
  });
  return out;
}

function isActive(state: EditorState, b: Block, active: Set<number>) {
  for (let n = state.doc.lineAt(b.from).number, e = state.doc.lineAt(b.to).number; n <= e; n++) if (active.has(n)) return true;
  return false;
}

/** The block decorations of `state` with `active` line numbers raw. Pure. */
export function buildBlockDecorations(state: EditorState, active: Set<number>): DecorationSet {
  const doc = state.doc;
  const out: Range<Decoration>[] = [];
  for (const b of blocks(state)) {
    if (isActive(state, b, active)) continue;
    if (b.name === "Table") {
      out.push(Decoration.replace({ widget: new TableWidget(doc.sliceString(b.from, b.to)), block: true }).range(b.from, b.to));
      continue;
    }
    const open = doc.lineAt(b.from);
    const last = doc.lineAt(b.to);
    const closed = last.number > open.number && /^\s*(```|~~~)/.test(last.text);
    if (closed && last.number === open.number + 1) {
      out.push(Decoration.replace({}).range(open.from, last.to));
      continue;
    }
    if (open.number < doc.lines) out.push(Decoration.replace({}).range(open.from, open.to + 1));
    // The closing fence goes with the line break before it.
    if (closed) out.push(Decoration.replace({}).range(doc.line(last.number - 1).to, last.to));
  }
  return Decoration.set(out, true);
}

type BlockState = { focused: boolean; key: string; deco: DecorationSet };

function activeKey(state: EditorState, active: Set<number>) {
  return blocks(state)
    .filter((b) => isActive(state, b, active))
    .map((b) => b.from)
    .join(",");
}

function compute(state: EditorState, focused: boolean): BlockState {
  const active = activeLines(state, focused);
  return { focused, key: activeKey(state, active), deco: buildBlockDecorations(state, active) };
}

export const blockField = StateField.define<BlockState>({
  create: (state) => compute(state, false),
  update(prev, tr) {
    let focused = prev.focused;
    for (const e of tr.effects) if (e.is(setFocused)) focused = e.value;
    const treeChanged = syntaxTree(tr.startState) !== syntaxTree(tr.state);
    if (!tr.docChanged && !treeChanged && focused === prev.focused) {
      if (!tr.selection) return prev;
      if (activeKey(tr.state, activeLines(tr.state, focused)) === prev.key) return prev;
    }
    return compute(tr.state, focused);
  },
  provide: (f) => EditorView.decorations.from(f, (s) => s.deco),
});

export const blockFocus = EditorView.focusChangeEffect.of((_state, focusing) => setFocused.of(focusing));
