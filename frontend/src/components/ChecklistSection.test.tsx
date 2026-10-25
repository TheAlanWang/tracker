// @vitest-environment jsdom
// Checklist outside Edit mode: tick / untick only. In Edit mode: add,
// rename, delete as well (each still saved immediately).
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const update = vi.hoisted(() => vi.fn());
// Never resolves: the request stays in flight for the whole test.
const create = vi.hoisted(() => vi.fn(() => new Promise(() => {})));
vi.mock("@/features/checklist/api", () => ({
  useChecklist: () => ({ data: [{ id: "i1", text: "Write tests", done: false }] }),
  useCreateChecklistItem: () => ({ mutateAsync: create, isPending: create.mock.calls.length > 0 }),
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
  create.mockClear();
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

describe("ChecklistSection add row", () => {
  it("Enter adds the step once, even if the input blurs while the request is in flight", async () => {
    await render(true);
    const input = el.querySelector<HTMLInputElement>('input[placeholder="Add a step…"]')!;
    input.focus();
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(input, "New step");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    await act(async () => input.blur());
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith("New step");
  });
});
