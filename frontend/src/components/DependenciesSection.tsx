// DependenciesSection — "Blocked by" + "Blocks" lists in the TaskDetail
// aside. Each direction shows linked tasks as compact rows; a "+ Add"
// button opens a popover that searches the workspace's tasks and lets
// the user pick one to link.
//
// Two interaction modes:
//   - Read-only (view mode): chips display only, no add / remove
//     affordances. Groups with zero items collapse so empty fields
//     don't take space.
//   - Editing with pending state (edit mode): all modifications go
//     through the parent's pending-state callbacks instead of firing
//     mutations immediately. The user must click TaskDetail's Save to
//     commit, matching how every other aside field works.
//
// Pending-add chips render with a dashed blue border so users can see
// "this isn't saved yet"; pending-removes hide from view until the
// user clicks Discard.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  type DependencyLink,
  useDependencies,
} from "@/features/dependencies/api";
import { type Task, useWorkspaceTasks } from "@/features/tasks/api";
import { StatusPill } from "@/components/StatusPill";

export type Direction = "blocker" | "blocking";

export type PendingDepAdd = {
  direction: Direction;
  task: Task;
};

function TaskChip({
  task,
  pending,
  onOpen,
  onRemove,
}: {
  task: Task;
  pending: boolean;
  onOpen?: (id: string) => void;
  // Omit to render read-only (no × hover button). When the chip is
  // pending, clicking × cancels the pending add rather than scheduling
  // a remove — the parent decides which based on which callback is
  // provided.
  onRemove?: () => void;
}) {
  const borderCls = pending
    ? "border-blue-300 dark:border-blue-700 border-dashed bg-blue-50/40 dark:bg-blue-950/20"
    : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900";
  return (
    <div
      className={`group flex items-center gap-2 rounded-md border px-2 py-1.5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors ${borderCls}`}
    >
      <button
        type="button"
        onClick={() => onOpen?.(task.id)}
        disabled={!onOpen}
        className="flex-1 min-w-0 flex items-center gap-2 text-left disabled:cursor-default"
      >
        <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500 shrink-0">
          {task.identifier}
        </span>
        <span className="text-sm text-slate-800 dark:text-slate-200 truncate">
          {task.title}
        </span>
        <StatusPill status={task.status} size="sm" className="shrink-0" />
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove dependency"
          className="opacity-0 group-hover:opacity-100 text-slate-400 dark:text-slate-500 hover:text-red-600 text-xs px-1 transition-opacity"
        >
          ×
        </button>
      )}
    </div>
  );
}

function AddDependencyPopover({
  anchor,
  workspaceId,
  excludeIds,
  onPick,
  onClose,
}: {
  anchor: DOMRect;
  workspaceId: string;
  excludeIds: Set<string>;
  onPick: (task: Task) => void;
  onClose: () => void;
}) {
  const { data: allTasks = [] } = useWorkspaceTasks(workspaceId);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onClickAway = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = allTasks.filter(
      (t) =>
        !excludeIds.has(t.id) &&
        (q === "" ||
          t.title.toLowerCase().includes(q) ||
          t.identifier.toLowerCase().includes(q)),
    );
    return filtered
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 10);
  }, [allTasks, excludeIds, query]);

  // Place above the trigger when there isn't enough room below.
  // Trigger is often near the modal's bottom (Dependencies live at the
  // tail of the aside) so flipping is the common case there. Keep the
  // popover at most ~360px tall and never wider than 360px.
  const MARGIN = 12;
  const POPOVER_H = 360;
  const spaceBelow = window.innerHeight - anchor.bottom - MARGIN;
  const spaceAbove = anchor.top - MARGIN;
  const flipUp = spaceBelow < 220 && spaceAbove > spaceBelow;
  const verticalStyle = flipUp
    ? { bottom: window.innerHeight - anchor.top + 4 }
    : { top: anchor.bottom + 4 };
  const maxHeight = Math.min(POPOVER_H, flipUp ? spaceAbove : spaceBelow);

  return createPortal(
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        left: Math.max(MARGIN, anchor.left),
        width: Math.max(320, Math.min(anchor.width, 360)),
        maxHeight,
        ...verticalStyle,
      }}
      // z-[60] beats the modal backdrop (z-50) so the popover always
      // floats above whatever container opened it.
      className="z-[60] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden flex flex-col"
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search tasks…"
        className="w-full px-3 py-2 text-sm bg-transparent border-b border-slate-100 dark:border-slate-800 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
      />
      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        {matches.length === 0 ? (
          <p className="px-3 py-3 text-xs text-slate-400 dark:text-slate-500 text-center">
            No tasks match.
          </p>
        ) : (
          matches.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onPick(t)}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-left"
            >
              <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500 shrink-0">
                {t.identifier}
              </span>
              <span className="text-sm text-slate-800 dark:text-slate-200 truncate flex-1">
                {t.title}
              </span>
              <StatusPill status={t.status} size="sm" className="shrink-0" />
            </button>
          ))
        )}
      </div>
    </div>,
    document.body,
  );
}

type GroupChip =
  | { kind: "persisted"; link: DependencyLink }
  | { kind: "pending"; task: Task };

function DependencyGroup({
  label,
  direction,
  chips,
  workspaceId,
  excludeIds,
  onOpenTask,
  readOnly,
  onAdd,
  onRemovePersisted,
  onCancelPending,
}: {
  label: string;
  direction: Direction;
  chips: GroupChip[];
  workspaceId: string;
  excludeIds: Set<string>;
  onOpenTask?: (id: string) => void;
  readOnly: boolean;
  onAdd: (direction: Direction, task: Task) => void;
  onRemovePersisted: (depId: string) => void;
  onCancelPending: (taskId: string, direction: Direction) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  function openPicker() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAnchor(rect);
  }

  // In view mode hide the whole group when there's nothing visible —
  // "Blocked by: None" is noise.
  if (readOnly && chips.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </p>
      {chips.map((c) =>
        c.kind === "persisted" ? (
          <TaskChip
            key={c.link.dependency_id}
            task={c.link.task}
            pending={false}
            onOpen={onOpenTask}
            onRemove={
              readOnly
                ? undefined
                : () => onRemovePersisted(c.link.dependency_id)
            }
          />
        ) : (
          <TaskChip
            key={`pending-${direction}-${c.task.id}`}
            task={c.task}
            pending
            onOpen={onOpenTask}
            onRemove={
              readOnly ? undefined : () => onCancelPending(c.task.id, direction)
            }
          />
        ),
      )}
      {!readOnly && (
        <button
          ref={buttonRef}
          type="button"
          onClick={openPicker}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:border-slate-400 dark:hover:border-slate-600 transition-colors"
        >
          + Add
        </button>
      )}
      {anchor && (
        <AddDependencyPopover
          anchor={anchor}
          workspaceId={workspaceId}
          excludeIds={excludeIds}
          onPick={(t) => {
            setAnchor(null);
            onAdd(direction, t);
          }}
          onClose={() => setAnchor(null)}
        />
      )}
    </div>
  );
}

export function DependenciesSection({
  taskId,
  workspaceId,
  onOpenTask,
  readOnly = false,
  pendingAdds = [],
  removedDepIds,
  onAdd,
  onRemovePersisted,
  onCancelPendingAdd,
}: {
  taskId: string;
  workspaceId: string;
  onOpenTask?: (id: string) => void;
  // When true, all add/remove affordances are hidden and the section
  // collapses if both directions are empty (view mode).
  readOnly?: boolean;
  // Pending-state inputs from the parent's draft. The parent (TaskDetail)
  // owns the state so it can diff and commit on Save.
  pendingAdds?: PendingDepAdd[];
  removedDepIds?: Set<string>;
  // Callbacks invoked instead of immediate mutations in edit mode.
  // When omitted, the section is effectively view-only.
  onAdd?: (direction: Direction, task: Task) => void;
  onRemovePersisted?: (depId: string) => void;
  onCancelPendingAdd?: (taskId: string, direction: Direction) => void;
}) {
  const { data } = useDependencies(taskId);
  const backendBlockers = data?.blockers ?? [];
  const backendBlocking = data?.blocking ?? [];
  const removed = removedDepIds ?? new Set<string>();

  // Compose what we render: backend chips that haven't been pending-
  // removed, plus pending-add chips for this direction.
  const blockerChips: GroupChip[] = [
    ...backendBlockers
      .filter((l) => !removed.has(l.dependency_id))
      .map<GroupChip>((link) => ({ kind: "persisted", link })),
    ...pendingAdds
      .filter((p) => p.direction === "blocker")
      .map<GroupChip>((p) => ({ kind: "pending", task: p.task })),
  ];
  const blockingChips: GroupChip[] = [
    ...backendBlocking
      .filter((l) => !removed.has(l.dependency_id))
      .map<GroupChip>((link) => ({ kind: "persisted", link })),
    ...pendingAdds
      .filter((p) => p.direction === "blocking")
      .map<GroupChip>((p) => ({ kind: "pending", task: p.task })),
  ];

  // View mode with nothing on either side → entire section collapses.
  if (readOnly && blockerChips.length === 0 && blockingChips.length === 0) {
    return null;
  }

  // Exclude what's already linked (or pending-linked) from the picker
  // so the same task can't be added twice. Self-exclusion too.
  const excludeIds = new Set<string>([
    taskId,
    ...blockerChips.map((c) =>
      c.kind === "persisted" ? c.link.task.id : c.task.id,
    ),
    ...blockingChips.map((c) =>
      c.kind === "persisted" ? c.link.task.id : c.task.id,
    ),
  ]);

  // No-op fallbacks so the component can render in pure view contexts.
  const noopAdd = () => undefined;
  const noopRemove = () => undefined;
  const noopCancel = () => undefined;

  return (
    <section className="space-y-4">
      <DependencyGroup
        label="Blocked by"
        direction="blocker"
        chips={blockerChips}
        workspaceId={workspaceId}
        excludeIds={excludeIds}
        onOpenTask={onOpenTask}
        readOnly={readOnly}
        onAdd={onAdd ?? noopAdd}
        onRemovePersisted={onRemovePersisted ?? noopRemove}
        onCancelPending={onCancelPendingAdd ?? noopCancel}
      />
      <DependencyGroup
        label="Blocks"
        direction="blocking"
        chips={blockingChips}
        workspaceId={workspaceId}
        excludeIds={excludeIds}
        onOpenTask={onOpenTask}
        readOnly={readOnly}
        onAdd={onAdd ?? noopAdd}
        onRemovePersisted={onRemovePersisted ?? noopRemove}
        onCancelPending={onCancelPendingAdd ?? noopCancel}
      />
    </section>
  );
}
