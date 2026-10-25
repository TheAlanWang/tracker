// @vitest-environment jsdom
// Checklist outside Edit mode: tick / untick only. In Edit mode: add,
// rename, delete as well (each still saved immediately).
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const update = vi.hoisted(() => vi.fn());
vi.mock("@/features/checklist/api", () => ({
  useChecklist: () => ({ data: [{ id: "i1", text: "Write tests", done: false }] }),
  useCreateChecklistItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateChecklistItem: () => ({ mutate: update }),
  useDeleteChecklistItem: () => ({ mutate: vi.fn() }),
}));

import { ChecklistSection } from "./ChecklistSection";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let el: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  el = document.createElement("div");
  document.body.replaceChildren(el);
  root = createRoot(el);
  update.mockClear();
});
afterEach(async () => {
  await act(async () => root.unmount());
});

const render = (editing: boolean) => act(async () => root.render(<ChecklistSection taskId="t" editing={editing} />));

describe("ChecklistSection", () => {
  it("view mode: can tick, but no add row, no rename, no delete", async () => {
    await render(false);
    expect(el.querySelector('input[placeholder="Add a step…"]')).toBeNull();
    expect(el.querySelector('[aria-label="Delete item"]')).toBeNull();
    expect([...el.querySelectorAll("button")].some((b) => b.textContent === "Write tests")).toBe(false);
    await act(async () => el.querySelector<HTMLButtonElement>('[aria-label="Mark done"]')!.click());
    expect(update).toHaveBeenCalledWith({ itemId: "i1", payload: { done: true } });
  });

  it("edit mode: add row, rename and delete are available", async () => {
    await render(true);
    expect(el.querySelector('input[placeholder="Add a step…"]')).not.toBeNull();
    expect(el.querySelector('[aria-label="Delete item"]')).not.toBeNull();
    expect([...el.querySelectorAll("button")].some((b) => b.textContent === "Write tests")).toBe(true);
  });
});
