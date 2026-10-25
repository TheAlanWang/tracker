// @vitest-environment jsdom
// Click-to-edit description with autosave: saves on blur / unmount only when
// changed, waits for image uploads, never clobbers what the user is typing.
import { EditorView } from "@codemirror/view";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const upload = vi.hoisted(() => ({ resolve: null as null | ((url: string) => void) }));
vi.mock("@/lib/uploadTaskImage", () => ({
  uploadTaskImage: () => new Promise<string>((r) => (upload.resolve = r)),
}));
// The uploaded image renders through <TaskImage>; no network in tests.
vi.mock("@/lib/resolveTaskImageUrl", async (orig) => ({
  ...(await orig<typeof import("@/lib/resolveTaskImageUrl")>()),
  resolveTaskImageUrl: async () => "data:image/png;base64,",
}));
const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

import { AutosaveMarkdown, type AutosaveMarkdownProps } from "./AutosaveMarkdown";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();

let el: HTMLDivElement;
let root: ReturnType<typeof createRoot> | null = null;
beforeEach(() => {
  el = document.createElement("div");
  document.body.replaceChildren(el);
  toastError.mockClear();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
});

async function mount(props: Partial<AutosaveMarkdownProps> = {}) {
  const onSave = vi.fn<(t: string) => Promise<void>>(async () => {});
  const all: AutosaveMarkdownProps = { value: "old", onSave, label: "Description", placeholder: "Add…", workspaceId: "w", userId: "u", ...props };
  root = createRoot(el);
  await act(async () => root!.render(<AutosaveMarkdown {...all} />));
  // The editor is lazy-loaded: wait for it.
  await vi.waitFor(() => expect(el.querySelector(".cm-editor")).not.toBeNull());
  const view = EditorView.findFromDOM(el.querySelector<HTMLElement>(".cm-editor")!)!;
  const rerender = (p: Partial<AutosaveMarkdownProps>) => act(async () => root!.render(<AutosaveMarkdown {...all} {...p} />));
  return { view, onSave: (all.onSave as typeof onSave), rerender };
}

const type = (view: EditorView, text: string) => act(async () => view.dispatch({ changes: { from: view.state.doc.length, insert: text } }));
const blur = (view: EditorView) => act(async () => view.contentDOM.blur());

describe("AutosaveMarkdown", () => {
  it("saves on blur when changed", async () => {
    const { view, onSave } = await mount();
    view.focus();
    await type(view, " new");
    await blur(view);
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith("old new"));
  });

  it("does not save on blur when unchanged", async () => {
    const { view, onSave } = await mount();
    view.focus();
    await blur(view);
    await new Promise((r) => setTimeout(r, 10));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves on unmount when dirty", async () => {
    const { view, onSave } = await mount();
    view.focus();
    await type(view, "!");
    await act(async () => root!.unmount());
    root = null;
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith("old!"));
  });

  it("waits for pending uploads before saving", async () => {
    const { view, onSave } = await mount();
    view.focus();
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", { value: { files: [new File(["x"], "shot.png", { type: "image/png" })] } });
    await act(async () => view.contentDOM.dispatchEvent(paste));
    expect(view.state.doc.toString()).toContain("![uploading shot.png…]()");
    await blur(view);
    await new Promise((r) => setTimeout(r, 10));
    expect(onSave).not.toHaveBeenCalled();
    await act(async () => upload.resolve!("task-image:w/u/shot.png"));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0];
    expect(saved).toContain("![shot.png](task-image:w/u/shot.png)");
    expect(saved).not.toContain("![uploading");
  });

  it("does not overwrite local edits on external value change while focused", async () => {
    const { view, rerender } = await mount();
    view.focus();
    await type(view, " typing");
    await rerender({ value: "server changed" });
    expect(view.state.doc.toString()).toBe("old typing");
  });

  it("adopts an external value when idle and saved", async () => {
    const { view, rerender } = await mount();
    await rerender({ value: "server changed" });
    expect(view.state.doc.toString()).toBe("server changed");
  });

  it("failed save keeps text and toasts", async () => {
    const onSave = vi.fn(async () => {
      throw new Error("boom");
    });
    const { view, rerender } = await mount({ onSave });
    view.focus();
    await type(view, " kept");
    await blur(view);
    await vi.waitFor(() => expect(toastError).toHaveBeenCalled());
    await rerender({ value: "old" }); // the refetch still has the old text
    expect(view.state.doc.toString()).toBe("old kept");
  });
});
