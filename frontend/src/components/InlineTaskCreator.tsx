import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { TaskStatus, useCreateTask } from "@/features/tasks/api";

type Props = {
  projectId: string;
  status: TaskStatus;
  triggerLabel?: string;
  triggerClassName?: string;
  placeholder?: string;
};

// Inline "+ Add task" affordance. Click → input replaces the button.
// Type + Enter (or click Add) creates the task. Esc / blur with empty
// input / Cancel returns to the button state. After a successful add,
// the input clears but stays focused for rapid multi-task entry — same
// pattern as Trello.
export function InlineTaskCreator({
  projectId,
  status,
  triggerLabel = "+ Add",
  triggerClassName,
  placeholder = "Task title…",
}: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const create = useCreateTask(projectId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      await create.mutateAsync({ title: trimmed, status });
      setTitle("");
      // stay in editing mode — keep focused input for next add
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to create task";
      toast.error(detail);
    }
  }

  function cancel() {
    setTitle("");
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={
          triggerClassName ??
          "w-full text-left text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 rounded px-2 py-1.5 transition-colors"
        }
      >
        {triggerLabel}
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 space-y-2 shadow-sm"
      onKeyDown={(e) => {
        if (e.key === "Escape") cancel();
      }}
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          // If user blurs out of the form entirely with empty input, collapse.
          // Use a small timeout so clicking Add/Cancel doesn't trip this.
          setTimeout(() => {
            if (!title.trim()) setEditing(false);
          }, 100);
        }}
        placeholder={placeholder}
        maxLength={200}
        className="w-full bg-transparent outline-none text-sm placeholder:text-slate-400"
      />
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={cancel}
          className="rounded-full"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={!title.trim() || create.isPending}
          className="rounded-full"
        >
          {create.isPending ? "Adding…" : "Add"}
        </Button>
      </div>
    </form>
  );
}
