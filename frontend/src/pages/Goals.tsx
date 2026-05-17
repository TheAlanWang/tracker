// Goals page — workspace-scoped strategic hierarchy navigator.
//
// Tasks track the "what" and "when". Goals track the "why": they're a
// recursive tree of objectives that tasks attach to. Two views over the
// same data:
//
//   - Map (default): left-to-right mind-map. Each goal node has a ⊕ on
//     its right edge to grow a sub-goal in place, plus a hover ⋯ menu
//     for rename / status / delete. Tasks attached to a goal show as
//     identifier pills inside its card. Click a task pill → modal.
//   - Columns: macOS-Finder column drill-down. Same edit affordances,
//     better for following one path top-to-bottom or working inside a
//     deep subtree.
//
// Tasks always open in a modal so the user stays in the goal context.

import { useState } from "react";
import { useParams } from "react-router-dom";

import { GoalMindMap } from "@/components/GoalMindMap";
import { MillerColumns } from "@/components/MillerColumns";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { useWorkspaces } from "@/features/workspaces/api";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

type View = "map" | "columns";

export default function Goals() {
  useDocumentTitle("Goals");
  const { wsSlug } = useParams();
  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [view, setView] = useState<View>("map");

  if (!currentWs) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Goals
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Plan top-down. Goals organise the <em>why</em>; tasks execute on
            them.
          </p>
        </div>
        <ViewToggle value={view} onChange={setView} />
      </div>
      {view === "map" ? (
        <GoalMindMap
          workspaceId={currentWs.id}
          onOpenTask={setOpenTaskId}
        />
      ) : (
        <MillerColumns
          workspaceId={currentWs.id}
          onOpenTask={setOpenTaskId}
        />
      )}
      {openTaskId && (
        <TaskDetailModal
          taskId={openTaskId}
          onClose={() => setOpenTaskId(null)}
        />
      )}
    </div>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: View;
  onChange: (v: View) => void;
}) {
  const base = "px-3 py-1 text-xs font-medium transition-colors";
  const active = "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm";
  const idle = "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100";
  return (
    <div className="inline-flex rounded-md bg-slate-100 dark:bg-slate-800 p-0.5 shrink-0">
      <button
        type="button"
        onClick={() => onChange("map")}
        className={`${base} rounded ${value === "map" ? active : idle}`}
      >
        Map
      </button>
      <button
        type="button"
        onClick={() => onChange("columns")}
        className={`${base} rounded ${value === "columns" ? active : idle}`}
      >
        Columns
      </button>
    </div>
  );
}
