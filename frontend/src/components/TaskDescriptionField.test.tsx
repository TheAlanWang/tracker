// @vitest-environment jsdom
// The description field saves to the task it was opened for, even when the
// page has already moved on to another task (unmount save after a switch).
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EditorView } from "@codemirror/view";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

const patch = vi.hoisted(() => vi.fn(async (url: string, body: { description: string }) => ({ data: { id: url.split("/").pop(), project_id: "p", ...body } })));
vi.mock("@/api/client", () => ({ apiClient: { patch } }));

import type { Task } from "@/features/tasks/api";

import { TaskDescriptionField } from "./TaskDescriptionField";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();

const task = (id: string, description: string) => ({ id, description, workspace_id: "w", project_id: "p" }) as Task;

describe("TaskDescriptionField", () => {
  it("an edit pending when the page switches tasks is saved to the original task", async () => {
    const el = document.createElement("div");
    document.body.replaceChildren(el);
    const qc = new QueryClient();
    const root = createRoot(el);
    const render = (t: Task) =>
      act(async () =>
        root.render(
          <QueryClientProvider client={qc}>
            <TaskDescriptionField key={t.id} task={t} />
          </QueryClientProvider>,
        ),
      );
    await render(task("A", "alpha"));
    await vi.waitFor(() => expect(el.querySelector(".cm-editor")).not.toBeNull());
    const view = EditorView.findFromDOM(el.querySelector<HTMLElement>(".cm-editor")!)!;
    view.focus();
    await act(async () => view.dispatch({ changes: { from: 5, insert: "!" } }));
    await render(task("B", "beta"));
    await vi.waitFor(() => expect(patch).toHaveBeenCalled());
    expect(patch).toHaveBeenCalledWith("/tasks/A", { description: "alpha!" });
    expect(patch).not.toHaveBeenCalledWith("/tasks/B", expect.anything());
    await act(async () => root.unmount());
  });
});
