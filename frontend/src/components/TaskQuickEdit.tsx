import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  TaskPriority,
  TaskStatus,
  Task,
  useDeleteTask,
  useUpdateTask,
} from "@/features/tasks/api";

const STATUSES: TaskStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "cancelled",
];

const PRIORITIES: TaskPriority[] = [
  "no_priority",
  "urgent",
  "high",
  "medium",
  "low",
];

type Props = {
  task: Task | null;
  open: boolean;
  onClose: () => void;
  wsSlug: string;
  pKey: string;
};

/**
 * Quick-edit modal for a task — set title, status, priority, due date,
 * description without leaving the current page. Click "Open in detail" to
 * go to the full TaskDetail page.
 */
export function TaskQuickEdit({ task, open, onClose, wsSlug, pKey }: Props) {
  const navigate = useNavigate();
  const updateMutation = useUpdateTask(task?.id ?? "");
  const deleteMutation = useDeleteTask();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("backlog");
  const [priority, setPriority] = useState<TaskPriority>("no_priority");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description);
      setStatus(task.status);
      setPriority(task.priority);
      setDueDate(task.due_date ?? "");
    }
  }, [task]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !task) return null;

  async function patch(payload: Record<string, unknown>) {
    try {
      await updateMutation.mutateAsync(payload as never);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to update";
      toast.error(detail);
    }
  }

  async function onSave() {
    if (!task) return;
    const payload: Record<string, unknown> = {};
    if (title !== task.title) payload.title = title;
    if (description !== task.description) payload.description = description;
    if (status !== task.status) payload.status = status;
    if (priority !== task.priority) payload.priority = priority;
    const dd = dueDate === "" ? null : dueDate;
    if (dd !== task.due_date) payload.due_date = dd;
    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }
    await patch(payload);
    onClose();
  }

  async function onDelete() {
    if (!task) return;
    if (!confirm(`Delete ${task.identifier}? This cannot be undone.`)) return;
    try {
      await deleteMutation.mutateAsync(task.id);
      toast.success("Task deleted");
      onClose();
    } catch (err) {
      toast.error("Failed to delete");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-lg bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-slate-500">{task.identifier}</span>
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate(`/w/${wsSlug}/p/${pKey}/tasks/${task.identifier}`);
              }}
              className="text-xs text-blue-600 hover:underline"
            >
              Open in detail ↗
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="space-y-1">
            <Label htmlFor="qe-title">Title</Label>
            <Input
              id="qe-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="qe-status">Status</Label>
              <select
                id="qe-status"
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm h-9"
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="qe-priority">Priority</Label>
              <select
                id="qe-priority"
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm h-9"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="qe-due">Due date</Label>
            <Input
              id="qe-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="qe-desc">Description</Label>
            <textarea
              id="qe-desc"
              className="w-full rounded border border-slate-300 bg-white p-2 text-sm"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={10000}
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
          <Button
            type="button"
            variant="outline"
            onClick={onDelete}
            className="text-red-600 border-red-300 hover:bg-red-50"
          >
            Delete
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={onSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
