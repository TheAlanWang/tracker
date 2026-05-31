// MillerColumns — horizontal column navigation for the workspace's Goal
// tree (think macOS Finder column view).
//
// Column 1 always shows top-level goals (parent_goal_id = null). Selecting
// a goal opens a new column to its right showing the selected goal's
// children. Selecting a card in an earlier column truncates everything to
// the right of it. At a leaf goal (no sub-goals), the right-hand column
// shows the goal's directly-linked tasks instead — a compact list with
// identifier + title + status pill.
//
// Editing a goal (rename / status / delete) is owned by GoalCard's own
// hover-revealed ⋯ menu — the card *is* the goal, so its actions belong
// to it. The column header is a pure label.

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { GoalCard } from "@/components/GoalCard";
import {
  type Goal,
  useCreateGoal,
  useGoalTasks,
  useGoals,
} from "@/features/goals/api";
import { StatusPill } from "@/components/StatusPill";
import { STATUS } from "@/features/tasks/labels";

type ColumnKey = string | null; // parent_goal_id of the column; null = root

function NewGoalForm({
  parentGoalId,
  workspaceId,
  onCreated,
}: {
  parentGoalId: string | null;
  workspaceId: string;
  onCreated: () => void;
}) {
  const create = useCreateGoal(workspaceId);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      await create.mutateAsync({ title: trimmed, parent_goal_id: parentGoalId });
      setTitle("");
      setOpen(false);
      onCreated();
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to create goal";
      toast.error(detail);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left text-sm text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-100 hover:bg-slate-50 dark:hover:bg-neutral-800/50 rounded px-2 py-1.5"
      >
        + New goal
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2 p-1">
      <input
        autoFocus
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Goal title…"
        maxLength={200}
        className="w-full rounded border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
      />
      <div className="flex items-center gap-2 justify-end">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTitle("");
          }}
          className="text-xs text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-100 px-2 py-1"
        >
          Cancel
        </button>
        <Button
          type="submit"
          size="sm"
          disabled={!title.trim() || create.isPending}
        >
          {create.isPending ? "Adding…" : "Add"}
        </Button>
      </div>
    </form>
  );
}

function TaskRow({
  task,
  onOpen,
}: {
  task: {
    id: string;
    identifier: string;
    title: string;
    status: keyof typeof STATUS;
  };
  onOpen: (taskId: string) => void;
}) {
  // We open the task in a modal owned by the Goals page so the user stays
  // in the goal-tree context. The standalone TaskDetail page still exists
  // at /w/.../p/.../tasks/<id> for deep links — it's just not the in-app
  // target here.
  return (
    <button
      type="button"
      onClick={() => onOpen(task.id)}
      className="w-full text-left flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-neutral-800/50"
    >
      <span className="text-xs text-slate-400 dark:text-neutral-500 shrink-0">
        {task.identifier}
      </span>
      <span className="flex-1 truncate text-sm text-slate-800 dark:text-neutral-200">
        {task.title}
      </span>
      <StatusPill status={task.status} size="sm" />
    </button>
  );
}

function Column({
  title,
  goals,
  selectedId,
  onSelect,
  parentGoalId,
  workspaceId,
  hasChildrenFor,
}: {
  title: string;
  goals: Goal[];
  selectedId: string | null;
  onSelect: (g: Goal) => void;
  parentGoalId: string | null;
  workspaceId: string;
  hasChildrenFor: (goalId: string) => boolean;
}) {
  return (
    <div className="flex-shrink-0 w-72 border-r border-slate-200 dark:border-neutral-800 bg-slate-50/40 flex flex-col">
      <div className="px-3 py-2 border-b border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400 truncate flex-1">
          {title}
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {goals.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-neutral-500 px-2 py-1">No goals here.</p>
        )}
        {goals.map((g) => (
          <GoalCard
            key={g.id}
            goal={g}
            selected={selectedId === g.id}
            hasChildren={hasChildrenFor(g.id)}
            onSelect={() => onSelect(g)}
            workspaceId={workspaceId}
          />
        ))}
        <NewGoalForm
          parentGoalId={parentGoalId}
          workspaceId={workspaceId}
          onCreated={() => {
            /* invalidates handled by mutation */
          }}
        />
      </div>
    </div>
  );
}

function TaskColumn({
  goal,
  onOpenTask,
}: {
  goal: Goal;
  onOpenTask: (taskId: string) => void;
}) {
  const { data: tasks = [], isLoading } = useGoalTasks(goal.id, {
    recursive: false,
  });
  return (
    <div className="flex-shrink-0 w-80 border-r border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex flex-col">
      <div className="px-3 py-2 border-b border-slate-200 dark:border-neutral-800 flex items-center">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400 truncate flex-1">
          Tasks in “{goal.title}”
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {isLoading && (
          <p className="text-xs text-slate-400 dark:text-neutral-500 px-2 py-1">Loading…</p>
        )}
        {!isLoading && tasks.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-neutral-500 px-2 py-1">
            No tasks linked yet. Open a task and pick this goal from its
            aside.
          </p>
        )}
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} onOpen={onOpenTask} />
        ))}
      </div>
    </div>
  );
}

export function MillerColumns({
  workspaceId,
  onOpenTask,
}: {
  workspaceId: string;
  onOpenTask: (taskId: string) => void;
}) {
  const { data: goals = [] } = useGoals(workspaceId);

  // The "path" is the chain of selected goals from root → leaf. Length 0
  // means only the root column is shown.
  const [path, setPath] = useState<string[]>([]);

  // Build a parent→children map once per goals change so each column can
  // look up its own list in O(1).
  const { childrenByParent, byId } = useMemo(() => {
    const map = new Map<ColumnKey, Goal[]>();
    const idMap = new Map<string, Goal>();
    for (const g of goals) {
      const arr = map.get(g.parent_goal_id) ?? [];
      arr.push(g);
      map.set(g.parent_goal_id, arr);
      idMap.set(g.id, g);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.position - b.position);
    }
    return { childrenByParent: map, byId: idMap };
  }, [goals]);

  // Sanity: if the selected goal at any depth has been deleted (stale path),
  // truncate the path to the deepest still-valid id.
  const validPath = useMemo(() => {
    const out: string[] = [];
    for (const id of path) {
      if (!byId.has(id)) break;
      out.push(id);
    }
    return out;
  }, [path, byId]);

  function selectAtDepth(depth: number, goal: Goal) {
    setPath((prev) => {
      const next = prev.slice(0, depth);
      next.push(goal.id);
      return next;
    });
  }

  const hasChildrenFor = (gid: string) =>
    (childrenByParent.get(gid)?.length ?? 0) > 0;

  const columns: React.ReactNode[] = [];

  // Column 0 (root)
  columns.push(
    <Column
      key="root"
      title="Goals"
      goals={childrenByParent.get(null) ?? []}
      selectedId={validPath[0] ?? null}
      onSelect={(g) => selectAtDepth(0, g)}
      parentGoalId={null}
      workspaceId={workspaceId}
      hasChildrenFor={hasChildrenFor}
    />,
  );

  // Subsequent columns: one per element in validPath.
  for (let i = 0; i < validPath.length; i++) {
    const parentId = validPath[i]!;
    const parentGoal = byId.get(parentId)!;
    const kids = childrenByParent.get(parentId) ?? [];
    if (kids.length > 0) {
      columns.push(
        <Column
          key={parentId}
          title={parentGoal.title}
          goals={kids}
          selectedId={validPath[i + 1] ?? null}
          onSelect={(g) => selectAtDepth(i + 1, g)}
          parentGoalId={parentId}
          workspaceId={workspaceId}
          hasChildrenFor={hasChildrenFor}
        />,
      );
    } else {
      // Leaf — show tasks column instead. Also still allow adding the first
      // sub-goal from a header action: render a tiny stub Column with no
      // goals so the user can create one inline.
      columns.push(
        <TaskColumn
          key={`${parentId}-tasks`}
          goal={parentGoal}
          onOpenTask={onOpenTask}
        />,
      );
      columns.push(
        <Column
          key={`${parentId}-new`}
          title={`Sub-goals of “${parentGoal.title}”`}
          goals={[]}
          selectedId={null}
          onSelect={() => {}}
          parentGoalId={parentId}
          workspaceId={workspaceId}
          hasChildrenFor={() => false}
        />,
      );
    }
  }

  return (
    <div className="flex h-[calc(100vh-180px)] overflow-x-auto border border-slate-200 dark:border-neutral-800 rounded-lg bg-white dark:bg-neutral-900">
      {columns}
    </div>
  );
}
