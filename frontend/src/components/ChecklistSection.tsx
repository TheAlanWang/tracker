// ChecklistSection — lightweight TODO list inside a task's detail page.
//
// Checklist items are NOT independent tasks: no identifier, no status,
// not shown in any list view. They're plain text + a checkbox stored in
// task_checklist_items. They're decoupled from the task's own status —
// the parent task can be marked done with items still unchecked; a soft
// toast warns the user about that, but doesn't block.
//
// The add affordance is a permanently visible ghost row at the bottom of
// the list — it mirrors the geometry of a real checklist row (faint "+"
// in the checkbox slot, text input where the label would be). No explicit
// Add button — Enter commits. This matches the Notion / Things / Linear
// pattern where adding feels like "type, then Enter" rather than "open a
// form, fill it, submit".

import { useState } from "react";
import { ListChecks } from "lucide-react";

import {
  type ChecklistItem,
  useChecklist,
  useCreateChecklistItem,
  useDeleteChecklistItem,
  useUpdateChecklistItem,
} from "@/features/checklist/api";

function ChecklistRow({
  item,
  onToggle,
  onRename,
  onDelete,
}: {
  item: ChecklistItem;
  onToggle: (next: boolean) => void;
  onRename: (next: string) => void;
  onDelete: () => void;
}) {
  // Inline rename: click the text → it becomes an input pre-filled with
  // the current text. Enter / blur saves, Esc reverts. The done-state
  // line-through is suppressed while editing so the text stays legible
  // as the user types over it.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);

  function startEdit() {
    setDraft(item.text);
    setEditing(true);
  }

  function commit() {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === item.text) return;
    onRename(next);
  }

  function cancel() {
    setDraft(item.text);
    setEditing(false);
  }

  return (
    <li className="group flex items-center gap-2 py-1">
      <button
        type="button"
        onClick={() => onToggle(!item.done)}
        aria-label={item.done ? "Mark not done" : "Mark done"}
        className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
          item.done
            ? "bg-emerald-500 border-emerald-500 text-white"
            : "border-slate-300 dark:border-neutral-700 hover:border-slate-400 bg-white dark:bg-neutral-900"
        }`}
      >
        {item.done && (
          <svg
            viewBox="0 0 16 16"
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path
              d="M3 8l3 3 7-7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
      {editing ? (
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          maxLength={200}
          className="flex-1 bg-transparent outline-none text-sm text-slate-800 dark:text-neutral-200"
        />
      ) : (
        <button
          type="button"
          onClick={startEdit}
          className={`flex-1 text-left text-sm cursor-text ${
            item.done ? "line-through text-slate-400 dark:text-neutral-500" : "text-slate-800 dark:text-neutral-200"
          }`}
        >
          {item.text}
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 text-slate-400 dark:text-neutral-500 hover:text-red-600 text-xs px-1 transition-opacity"
        aria-label="Delete item"
      >
        ×
      </button>
    </li>
  );
}

// AddRow — the ghost row at the bottom. Geometry matches ChecklistRow so
// the "+" sits exactly where the real checkbox would, and the input text
// baseline aligns with item text above it. Enter commits + clears for
// the next entry; Esc blurs.
function AddRow({
  onCommit,
  pending,
}: {
  onCommit: (text: string) => Promise<void>;
  pending: boolean;
}) {
  const [draft, setDraft] = useState("");

  async function commit() {
    const text = draft.trim();
    if (!text) return;
    await onCommit(text);
    setDraft("");
  }

  return (
    <li className="group flex items-center gap-2 py-1">
      <span
        aria-hidden
        // Same footprint as the real checkbox above so the column lines
        // up perfectly. Faint "+" makes it read as "this row creates a
        // new item" without resembling an unchecked, clickable checkbox.
        className="shrink-0 w-4 h-4 flex items-center justify-center text-slate-300 text-base leading-none"
      >
        +
      </span>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setDraft("");
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder="Add a step…"
        maxLength={200}
        disabled={pending}
        className="flex-1 bg-transparent outline-none text-sm text-slate-800 dark:text-neutral-200 placeholder:text-slate-400 disabled:opacity-50"
      />
    </li>
  );
}

export function ChecklistSection({
  taskId,
  forceShow = false,
}: {
  taskId: string;
  // When true, render the section even with zero items so the AddRow
  // is reachable. Parent flips this from a "+ Add checklist" entry-
  // point button when the section is otherwise hidden.
  forceShow?: boolean;
}) {
  const { data: items = [] } = useChecklist(taskId);
  const createItem = useCreateChecklistItem(taskId);
  const updateItem = useUpdateChecklistItem(taskId);
  const deleteItem = useDeleteChecklistItem(taskId);

  const total = items.length;
  const done = items.filter((i) => i.done).length;

  // Hide entirely when empty. Keeps tasks that don't need a checklist
  // visually clean. The parent shows a "+ Add checklist" button in
  // place and flips `forceShow` when clicked so the AddRow appears.
  if (total === 0 && !forceShow) return null;

  return (
    <details open className="pt-6 group">
      <summary className="cursor-pointer list-none flex items-center gap-1.5 text-sm font-normal uppercase tracking-wide text-muted-foreground hover:text-slate-700 dark:hover:text-neutral-300 group-open:pb-2 group-open:border-b border-slate-200 dark:border-neutral-800">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-3 h-3 transition-transform group-open:rotate-90"
        >
          <path
            fillRule="evenodd"
            d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
            clipRule="evenodd"
          />
        </svg>
        <ListChecks className="w-3.5 h-3.5" aria-hidden />
        <span>Checklist</span>
        {total > 0 && (
          <span className="text-slate-400 dark:text-neutral-500 font-medium normal-case tracking-normal">
            ({done}/{total})
          </span>
        )}
      </summary>
      <ul className="space-y-0 mt-2">
        {items.map((it) => (
          <ChecklistRow
            key={it.id}
            item={it}
            onToggle={(next) =>
              updateItem.mutate({ itemId: it.id, payload: { done: next } })
            }
            onRename={(next) =>
              updateItem.mutate({ itemId: it.id, payload: { text: next } })
            }
            onDelete={() => deleteItem.mutate(it.id)}
          />
        ))}
        <AddRow
          onCommit={(text) => createItem.mutateAsync(text).then(() => undefined)}
          pending={createItem.isPending}
        />
      </ul>
    </details>
  );
}

// Helper exported for TaskDetail's "marked done with unchecked items" toast.
// Returns the count of unchecked items for a task without re-fetching.
// Implemented as a hook so TaskDetail can simply read the count.
export function useUncheckedCount(taskId: string): number {
  const { data: items = [] } = useChecklist(taskId);
  return items.filter((i) => !i.done).length;
}
