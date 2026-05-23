// LabelsEditor — inline editor for the labels attached to a single task.
//
// UI:
//   - Renders the task's current labels as colored chips with an "×" to
//     detach.
//   - A "+ Add label" trigger opens a portal popover containing every
//     workspace label as a checkbox row; clicking a row toggles attach /
//     detach. At the bottom of the list, a "+ New label" form lets users
//     create a workspace label inline (name + color from a fixed palette)
//     so they never have to bounce out to a separate management page just
//     to apply a label they haven't created yet.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import {
  type Label,
  useAttachLabel,
  useCreateLabel,
  useDetachLabel,
  useLabels,
  useTaskLabels,
} from "@/features/labels/api";

// Hand-picked palette — broad enough to cover the common categorisation
// patterns (severity, area, type) without exposing a full color picker.
const COLOR_PALETTE = [
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#ef4444", // red
  "#f59e0b", // amber
  "#10b981", // emerald
  "#14b8a6", // teal
  "#64748b", // slate
];

// Naive YIQ check so we choose readable text-on-color for chips and
// swatches. Doesn't need to be exact — just "is this a dark bg?".
function isDarkColor(hex: string): boolean {
  const m = hex.replace("#", "");
  const n = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 140;
}

function LabelChip({
  label,
  onRemove,
}: {
  label: Label;
  onRemove?: () => void;
}) {
  const dark = isDarkColor(label.color);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: label.color,
        color: dark ? "white" : "#0f172a",
      }}
    >
      <span>{label.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="opacity-70 hover:opacity-100"
          aria-label={`Remove ${label.name}`}
        >
          ×
        </button>
      )}
    </span>
  );
}

export function LabelsEditor({
  taskId,
  workspaceId,
  readOnly = false,
}: {
  taskId: string;
  workspaceId: string;
  readOnly?: boolean;
}) {
  const { data: workspaceLabels = [] } = useLabels(workspaceId);
  const { data: taskLabels = [] } = useTaskLabels(taskId);
  const attach = useAttachLabel(taskId);
  const detach = useDetachLabel(taskId);
  const create = useCreateLabel(workspaceId);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(COLOR_PALETTE[0]!);

  useEffect(() => {
    if (!open) return;
    const el = triggerRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setPos({ left: r.left, top: r.bottom + 4 });
    }
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
      setCreating(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (creating) setCreating(false);
        else setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, creating]);

  const attached = new Set(taskLabels.map((l) => l.id));

  function toggle(labelId: string) {
    if (attached.has(labelId)) detach.mutate(labelId);
    else attach.mutate(labelId);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    try {
      const label = await create.mutateAsync({ name, color: newColor });
      // Auto-attach the newly created label — that's almost always what the
      // user wants when they create one from this popover.
      await attach.mutateAsync(label.id);
      setCreating(false);
      setNewName("");
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to create label";
      toast.error(detail);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {taskLabels.map((l) => (
          <LabelChip
            key={l.id}
            label={l}
            onRemove={readOnly ? undefined : () => detach.mutate(l.id)}
          />
        ))}
        {!readOnly && (
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-100 hover:border-slate-400 dark:hover:border-neutral-600 transition-colors"
          >
            + Add
          </button>
        )}
      </div>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ position: "fixed", left: pos.left, top: pos.top }}
            className="z-50 w-64 rounded-lg border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="max-h-64 overflow-y-auto py-1">
              {workspaceLabels.length === 0 && !creating && (
                <p className="px-3 py-2 text-xs text-slate-400 dark:text-neutral-500">
                  No labels yet. Create one below.
                </p>
              )}
              {workspaceLabels.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => toggle(l.id)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-neutral-800/50 text-left"
                >
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: l.color }}
                  />
                  <span className="flex-1 truncate text-slate-800 dark:text-neutral-200">
                    {l.name}
                  </span>
                  {attached.has(l.id) && (
                    <span className="text-blue-600 text-xs">✓</span>
                  )}
                </button>
              ))}
            </div>
            <div className="border-t border-slate-100 dark:border-neutral-800 p-2">
              {creating ? (
                <form onSubmit={onCreate} className="space-y-2">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Label name"
                    maxLength={50}
                    autoFocus
                    className="w-full rounded border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
                  />
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {COLOR_PALETTE.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewColor(c)}
                        aria-label={c}
                        className={`w-5 h-5 rounded-full border-2 transition-all ${
                          newColor === c
                            ? "border-slate-900 scale-110"
                            : "border-transparent"
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCreating(false);
                        setNewName("");
                      }}
                      className="text-xs text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-100 px-2 py-1"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!newName.trim() || create.isPending}
                      className="rounded bg-slate-900 text-white text-xs px-2.5 py-1 hover:bg-slate-700 disabled:opacity-50"
                    >
                      {create.isPending ? "Creating…" : "Create"}
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setNewName("");
                    setNewColor(COLOR_PALETTE[0]!);
                    setCreating(true);
                  }}
                  className="w-full text-left text-sm text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-100 hover:bg-slate-50 dark:hover:bg-neutral-800/50 rounded px-2 py-1.5"
                >
                  + New label
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
