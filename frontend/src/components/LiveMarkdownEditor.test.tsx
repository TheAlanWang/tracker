// @vitest-environment jsdom
// The live editor in a layout-less DOM: text comes back byte for byte, the
// keys (Mod-Enter, Escape with and without an IME), external values, limits.
import { completionStatus, startCompletion } from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Member } from "@/features/members/api";

import LiveMarkdownEditor, { type LiveMarkdownEditorHandle, type LiveMarkdownEditorProps } from "./LiveMarkdownEditor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no layout; CodeMirror only measures, so empty boxes do.
const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();

let el: HTMLDivElement;
let root: ReturnType<typeof createRoot> | null = null;
beforeEach(() => {
  el = document.createElement("div");
  document.body.replaceChildren(el);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
});

async function mount(props: Partial<LiveMarkdownEditorProps> = {}) {
  const onChange = vi.fn();
  const ref = createRef<LiveMarkdownEditorHandle>();
  const all = { value: "", onChange, label: "Description", ...props };
  root = createRoot(el);
  await act(async () => root!.render(<LiveMarkdownEditor ref={ref} {...all} />));
  const view = EditorView.findFromDOM(el.querySelector<HTMLElement>(".cm-editor")!)!;
  const rerender = (p: Partial<LiveMarkdownEditorProps>) =>
    act(async () => root!.render(<LiveMarkdownEditor ref={ref} {...all} {...p} />));
  return { view, onChange, ref, rerender };
}

function key(view: EditorView, init: KeyboardEventInit) {
  const e = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  view.contentDOM.dispatchEvent(e);
  return e;
}

describe("LiveMarkdownEditor", () => {
  it("typing calls onChange with the exact text (\\r\\n kept)", async () => {
    const doc = "# T\r\nline\r\n";
    const { view, onChange } = await mount({ value: doc });
    expect(view.state.doc.toString()).toBe(doc);
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => view.dispatch({ changes: { from: 0, insert: "x" } }));
    expect(onChange).toHaveBeenLastCalledWith("x" + doc);
  });

  it("Mod-Enter calls onSubmit", async () => {
    const onSubmit = vi.fn();
    const { view } = await mount({ onSubmit });
    key(view, { key: "Enter", ctrlKey: true }); // jsdom is not a Mac: Mod = Ctrl
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("Escape while composing does not propagate", async () => {
    const outer = vi.fn();
    window.addEventListener("keydown", outer);
    const { view } = await mount();
    key(view, { key: "Escape", isComposing: true });
    window.removeEventListener("keydown", outer);
    expect(outer).not.toHaveBeenCalled();
  });

  it("Escape (not composing) blurs the editor and does not propagate", async () => {
    const outer = vi.fn();
    const onBlur = vi.fn();
    const { view } = await mount({ onBlur });
    view.focus();
    window.addEventListener("keydown", outer);
    key(view, { key: "Escape" });
    window.removeEventListener("keydown", outer);
    expect(outer).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(view.contentDOM);
  });

  it("Escape that closes the @-mention list does not propagate", async () => {
    const outer = vi.fn();
    const members = [{ user_id: "1", display_name: "Joy Li", email: "joy@x.com" }] as Member[];
    const { view } = await mount({ members });
    view.focus();
    await act(async () => view.dispatch({ changes: { from: 0, insert: "@jo" }, selection: { anchor: 3 } }));
    await act(async () => void startCompletion(view));
    await vi.waitFor(() => expect(completionStatus(view.state)).toBe("active"));
    window.addEventListener("keydown", outer);
    key(view, { key: "Escape" });
    window.removeEventListener("keydown", outer);
    expect(outer).not.toHaveBeenCalled();
  });

  it("external value applied when not focused, ignored while focused", async () => {
    const { view, rerender } = await mount({ value: "a" });
    await rerender({ value: "b" });
    expect(view.state.doc.toString()).toBe("b");
    view.focus();
    await rerender({ value: "c" });
    expect(view.state.doc.toString()).toBe("b");
  });

  it("maxLength blocks insertion past the limit", async () => {
    const { view } = await mount({ value: "abc", maxLength: 4 });
    view.dispatch({ changes: { from: 3, insert: "de" } });
    expect(view.state.doc.toString()).toBe("abc");
    view.dispatch({ changes: { from: 3, insert: "d" } });
    expect(view.state.doc.toString()).toBe("abcd");
  });

  it("handle: insertAtCursor and replaceText edit the document", async () => {
    const { view, ref, onChange } = await mount({ value: "ab" });
    view.dispatch({ selection: { anchor: 1 } });
    await act(async () => ref.current!.insertAtCursor("X"));
    expect(view.state.doc.toString()).toBe("aXb");
    await act(async () => ref.current!.replaceText("X", "YY"));
    expect(view.state.doc.toString()).toBe("aYYb");
    expect(ref.current!.getText()).toBe("aYYb");
    expect(onChange).toHaveBeenLastCalledWith("aYYb");
  });
});
