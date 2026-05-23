// GoalCard — one row in a Miller column.
//
// Renders the goal's title, status chip, and roll-up progress, plus a
// hover-revealed ⋯ actions menu in the top-right. The actions menu lives
// here (not on the column header) because the card *is* the goal — its
// edit actions belong to the card, not to the column that happens to
// show the card's children.
//
// Click anywhere on the card body → onSelect (opens the next column).
// Click ⋯ → opens the actions popover; the click is contained so it
// doesn't also bubble into selection.

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  type Goal,
  type GoalStatus,
  useDeleteGoal,
  useUpdateGoal,
} from "@/features/goals/api";

const STATUS_STYLE: Record<GoalStatus, string> = {
  active: "bg-blue-50 text-blue-700",
  achieved: "bg-emerald-50 text-emerald-700",
  paused: "bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400",
  dropped: "bg-red-50 text-red-600",
};

const STATUS_LABEL: Record<GoalStatus, string> = {
  active: "Active",
  achieved: "Achieved",
  paused: "Paused",
  dropped: "Dropped",
};

function GoalActionsMenu({
  goal,
  workspaceId,
  forceVisible,
  setForceVisible,
}: {
  goal: Goal;
  workspaceId: string;
  // The card sets this to true while the menu is open so the ⋯ button
  // doesn't fade out when the mouse leaves the card on its way to a
  // menu item.
  forceVisible: boolean;
  setForceVisible: (v: boolean) => void;
}) {
  const update = useUpdateGoal(goal.id);
  const del = useDeleteGoal(workspaceId);
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  // Mirror local open ↔ parent forceVisible so the card knows when to
  // keep the ⋯ button rendered through mouse-leave.
  useEffect(() => {
    setForceVisible(open);
  }, [open, setForceVisible]);

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pickStatus(s: GoalStatus) {
    update.mutate({ status: s });
    setOpen(false);
  }

  function onRename() {
    setOpen(false);
    const next = window.prompt("Rename goal", goal.title);
    if (next && next.trim() && next.trim() !== goal.title) {
      update.mutate({ title: next.trim() });
    }
  }

  async function onDelete() {
    setOpen(false);
    if (
      !window.confirm(
        `Delete "${goal.title}" and all its sub-goals? Tasks linked to it will be unlinked but not deleted.`,
      )
    )
      return;
    try {
      await del.mutateAsync(goal.id);
    } catch {
      toast.error("Failed to delete goal");
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        // Don't propagate — clicking ⋯ should not also select the card.
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`px-1.5 py-0 rounded text-slate-400 dark:text-neutral-500 hover:text-slate-700 dark:hover:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 text-sm leading-none transition-opacity ${
          forceVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
        aria-label="Goal actions"
      >
        ⋯
      </button>
      {open && (
        <div
          // Stop card-level clicks bubbling out of the menu when the user
          // chooses an item.
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-6 z-20 w-44 rounded-md border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-lg py-1 text-sm"
        >
          <button
            type="button"
            onClick={onRename}
            className="w-full text-left px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-neutral-800/50"
          >
            Rename
          </button>
          <div className="border-t border-slate-100 dark:border-neutral-800 my-1" />
          <p className="px-3 py-0.5 text-[10px] uppercase text-slate-400 dark:text-neutral-500">
            Status
          </p>
          {(["active", "achieved", "paused", "dropped"] as GoalStatus[]).map(
            (s) => (
              <button
                key={s}
                type="button"
                onClick={() => pickStatus(s)}
                className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-neutral-800/50 ${
                  goal.status === s ? "font-semibold text-slate-900 dark:text-neutral-200" : ""
                }`}
              >
                {STATUS_LABEL[s]}
              </button>
            ),
          )}
          <div className="border-t border-slate-100 dark:border-neutral-800 my-1" />
          <button
            type="button"
            onClick={onDelete}
            className="w-full text-left px-3 py-1.5 text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export function GoalCard({
  goal,
  selected,
  hasChildren,
  onSelect,
  workspaceId,
}: {
  goal: Goal;
  selected: boolean;
  hasChildren: boolean;
  onSelect: () => void;
  workspaceId: string;
}) {
  const total = goal.descendant_task_count;
  const done = goal.done_task_count;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const [menuVisible, setMenuVisible] = useState(false);

  return (
    // role=button (not actual <button>) so we can nest a real <button> for
    // the ⋯ menu. Keyboard activation still works through onKeyDown.
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`group relative w-full cursor-pointer rounded-md border bg-white dark:bg-neutral-900 pl-3 pr-2 py-2.5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${
        selected
          ? "border-blue-500 ring-1 ring-blue-200 shadow-sm"
          : "border-slate-200 dark:border-neutral-800 hover:border-slate-300"
      }`}
    >
      <div className="min-w-0 pr-6">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-neutral-200 truncate">
            {goal.title}
          </h3>
          {goal.status !== "active" && (
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLE[goal.status]}`}
            >
              {STATUS_LABEL[goal.status]}
            </span>
          )}
        </div>
        {goal.description && (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-neutral-400 line-clamp-1">
            {goal.description}
          </p>
        )}
        {total > 0 ? (
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1 flex-1 rounded-full bg-slate-100 dark:bg-neutral-800 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-slate-500 dark:text-neutral-400">
              {done}/{total}
            </span>
          </div>
        ) : (
          <p className="mt-2 text-[10px] text-slate-400 dark:text-neutral-500">No tasks linked</p>
        )}
      </div>

      {/* Top-right cluster: chevron (only when there are children) +
          actions ⋯ (hover-revealed). They sit side-by-side so they
          never visually conflict. */}
      <div className="absolute top-2 right-2 flex items-center gap-0.5">
        <GoalActionsMenu
          goal={goal}
          workspaceId={workspaceId}
          forceVisible={menuVisible}
          setForceVisible={setMenuVisible}
        />
        {hasChildren && (
          <span className="text-slate-400 dark:text-neutral-500 text-sm leading-none px-1">›</span>
        )}
      </div>
    </div>
  );
}
