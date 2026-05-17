// GoalMindMap — left-to-right horizontal tree of the workspace's Goals.
//
// Replaces the indented Outline view. Where Columns is the editor and
// Outline used to be a read-only review, this view doubles as both:
//   - Visual review: the whole tree spreads to the right with bezier
//     connectors, status + progress on every node, so you can scan a
//     workspace's "strategy graph" at a glance.
//   - Lightweight structure editor: every node has a ⊕ button on its
//     right edge to grow a sub-goal in place, plus a hover-revealed ⋯
//     menu for rename / status / delete (reusing GoalCard's actions).
//
// Layout is hand-rolled (no react-flow / d3): each subtree's vertical
// span is the leaf-count of its goal-descendants × ROW_H. Tasks attached
// directly to a goal live INSIDE its card (small identifier pills), so
// they don't contribute to layout — keeps the algorithm a simple
// post-order walk.
//
// Tasks can attach to any goal (leaf or non-leaf) — the schema doesn't
// distinguish, and neither does this view. A goal with both sub-goals
// AND direct tasks shows the sub-goals as branches and the tasks as
// pills inside the card.

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  type Goal,
  type GoalStatus,
  useCreateGoal,
  useDeleteGoal,
  useGoals,
  useUpdateGoal,
} from "@/features/goals/api";
import { type Task, useWorkspaceTasks } from "@/features/tasks/api";
import { STATUS_STYLE } from "@/features/tasks/labels";

// Geometry constants — tweak together. Keep ROW_H >= NODE_H + breathing
// room so subtrees don't overlap when leaves stack vertically.
const NODE_W = 220;
const NODE_H = 84;
const ROW_H = 100;
const COL_GAP = 80;
const COL_W = NODE_W + COL_GAP;
const PAD = 32;

const GOAL_STATUS_STYLE: Record<GoalStatus, string> = {
  active: "bg-blue-50 text-blue-700",
  achieved: "bg-emerald-50 text-emerald-700",
  paused: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
  dropped: "bg-red-50 text-red-600",
};

const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  active: "Active",
  achieved: "Achieved",
  paused: "Paused",
  dropped: "Dropped",
};

// A node we render. `goal === null` means a ghost "add sub-goal" input
// reserved at the position where the user is currently typing the new
// goal's title.
type LayoutNode = {
  key: string;
  goal: Goal | null;
  parentGoalId: string | null;
  depth: number;
  x: number;
  y: number;
  childKeys: string[];
};

// Post-order: walk children first, compute each subtree's height as a
// multiple of ROW_H, then place each node centred against its subtree.
function buildLayout(
  goals: Goal[],
  addingFor: string | null | "root" | null,
  expanded: Set<string>,
): {
  nodes: Map<string, LayoutNode>;
  rootKeys: string[];
  width: number;
  height: number;
} {
  const childrenByParent = new Map<string | null, Goal[]>();
  for (const g of goals) {
    const arr = childrenByParent.get(g.parent_goal_id) ?? [];
    arr.push(g);
    childrenByParent.set(g.parent_goal_id, arr);
  }
  for (const arr of childrenByParent.values()) {
    arr.sort((a, b) => a.position - b.position);
  }

  const nodes = new Map<string, LayoutNode>();

  // A goal "shows its children" when it's the synthetic root OR the user
  // has expanded it OR a ghost is being typed under it (in which case we
  // implicitly expand so the new sub-goal is visible).
  function showsChildren(goalId: string | null): boolean {
    if (goalId === null) return true;
    if (expanded.has(goalId)) return true;
    if (addingFor === goalId) return true;
    return false;
  }

  // leafSpan(goal) = number of ROW_H slots this subtree needs vertically.
  // Collapsed goals count as 1 regardless of how many descendants they
  // have — they just don't render their subtree.
  function leafSpan(goalId: string | null): number {
    const kids = showsChildren(goalId)
      ? (childrenByParent.get(goalId) ?? [])
      : [];
    const ghost = addingFor === (goalId ?? "root") ? 1 : 0;
    if (kids.length === 0 && ghost === 0) return 1;
    let total = ghost;
    for (const k of kids) total += leafSpan(k.id);
    return total || 1;
  }

  // place: position one subtree starting at (x, top). Returns the
  // subtree's vertical span in pixels for the parent to stack siblings.
  function place(
    goal: Goal | null,
    parentGoalId: string | null,
    depth: number,
    top: number,
  ): { key: string; height: number } {
    const goalId = goal?.id ?? null;
    const kids = showsChildren(goalId)
      ? (childrenByParent.get(goalId ?? null) ?? [])
      : [];
    const ghost = addingFor === (goalId ?? "root");
    const span = leafSpan(goalId);
    const heightPx = span * ROW_H;
    const myY = top + heightPx / 2 - NODE_H / 2;
    const key = goal ? goal.id : `ghost:${parentGoalId ?? "root"}`;
    const childKeys: string[] = [];
    let cursor = top;
    for (const k of kids) {
      const placed = place(k, goalId, depth + 1, cursor);
      childKeys.push(placed.key);
      cursor += placed.height;
    }
    if (ghost) {
      const ghostKey = `ghost:${goalId ?? "root"}`;
      childKeys.push(ghostKey);
      nodes.set(ghostKey, {
        key: ghostKey,
        goal: null,
        parentGoalId: goalId,
        depth: depth + 1,
        x: PAD + (depth + 1) * COL_W,
        y: cursor + ROW_H / 2 - NODE_H / 2,
        childKeys: [],
      });
      cursor += ROW_H;
    }
    if (goal) {
      nodes.set(key, {
        key,
        goal,
        parentGoalId,
        depth,
        x: PAD + depth * COL_W,
        y: myY,
        childKeys,
      });
    }
    return { key, height: heightPx };
  }

  const roots = childrenByParent.get(null) ?? [];
  const rootKeys: string[] = [];
  let cursor = PAD;
  // A pseudo-root ghost slot for adding a brand new top-level goal.
  if (addingFor === "root") {
    const ghostKey = `ghost:root`;
    rootKeys.push(ghostKey);
    nodes.set(ghostKey, {
      key: ghostKey,
      goal: null,
      parentGoalId: null,
      depth: 0,
      x: PAD,
      y: cursor + ROW_H / 2 - NODE_H / 2,
      childKeys: [],
    });
    cursor += ROW_H;
  }
  for (const r of roots) {
    const placed = place(r, null, 0, cursor);
    rootKeys.push(placed.key);
    cursor += placed.height;
  }

  // Compute max depth for canvas width
  let maxDepth = 0;
  for (const n of nodes.values()) if (n.depth > maxDepth) maxDepth = n.depth;
  const width = (maxDepth + 1) * COL_W + PAD * 2;
  const height = cursor + PAD;

  return { nodes, rootKeys, width, height };
}

// Bezier connector from one node's right edge to another's left edge.
function connectorPath(parent: LayoutNode, child: LayoutNode): string {
  const x1 = parent.x + NODE_W;
  const y1 = parent.y + NODE_H / 2;
  const x2 = child.x;
  const y2 = child.y + NODE_H / 2;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

// Reused for the ⋯ actions popover — mirrors GoalCard's menu but
// positioned for a fixed-size mind-map node.
function NodeActionsMenu({
  goal,
  workspaceId,
  forceVisible,
  setForceVisible,
}: {
  goal: Goal;
  workspaceId: string;
  forceVisible: boolean;
  setForceVisible: (v: boolean) => void;
}) {
  const update = useUpdateGoal(goal.id);
  const del = useDeleteGoal(workspaceId);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`px-1.5 py-0 rounded text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm leading-none transition-opacity ${
          forceVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
        aria-label="Goal actions"
      >
        ⋯
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-6 z-30 w-44 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg py-1 text-sm"
        >
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              const next = window.prompt("Rename goal", goal.title);
              if (next && next.trim() && next.trim() !== goal.title) {
                update.mutate({ title: next.trim() });
              }
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50"
          >
            Rename
          </button>
          <div className="border-t border-slate-100 dark:border-slate-800 my-1" />
          <p className="px-3 py-0.5 text-[10px] uppercase text-slate-400 dark:text-slate-500">
            Status
          </p>
          {(["active", "achieved", "paused", "dropped"] as GoalStatus[]).map(
            (s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  update.mutate({ status: s });
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                  goal.status === s ? "font-semibold text-slate-900 dark:text-slate-100" : ""
                }`}
              >
                {GOAL_STATUS_LABEL[s]}
              </button>
            ),
          )}
          <div className="border-t border-slate-100 dark:border-slate-800 my-1" />
          <button
            type="button"
            onClick={async () => {
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
            }}
            className="w-full text-left px-3 py-1.5 text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function GoalNodeCard({
  goal,
  workspaceId,
  tasks,
  childCount,
  expanded,
  onToggle,
  onAddSubGoal,
  onOpenTask,
}: {
  goal: Goal;
  workspaceId: string;
  tasks: Task[];
  // Number of direct sub-goal children. Used to show a hidden-count
  // chevron when collapsed so the user knows there's something to expand.
  childCount: number;
  expanded: boolean;
  onToggle: () => void;
  onAddSubGoal: () => void;
  onOpenTask: (taskId: string) => void;
}) {
  const total = goal.descendant_task_count;
  const done = goal.done_task_count;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const [menuVisible, setMenuVisible] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      className={`group absolute rounded-md border bg-white dark:bg-slate-900 shadow-sm transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${
        expanded && childCount > 0
          ? "border-blue-300"
          : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
      }`}
      style={{
        width: NODE_W,
        height: NODE_H,
      }}
    >
      <div className="h-full flex flex-col px-3 py-2 overflow-hidden">
        {/* pr-7 makes room for the absolutely-positioned ⋯ menu below.
            The menu lives outside this overflow-hidden container so its
            dropdown can spill past the card's bottom edge without being
            clipped. */}
        <div className="flex items-center gap-1.5 min-w-0 pr-7">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate flex-1">
            {goal.title}
          </h3>
          {goal.status !== "active" && (
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${GOAL_STATUS_STYLE[goal.status]}`}
            >
              {GOAL_STATUS_LABEL[goal.status]}
            </span>
          )}
        </div>
        {total > 0 ? (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1 flex-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
              {done}/{total}
            </span>
          </div>
        ) : (
          <p className="mt-1.5 text-[10px] text-slate-400 dark:text-slate-500">No tasks</p>
        )}
        {tasks.length > 0 && (
          <div className="mt-1.5 flex items-center gap-1 flex-wrap overflow-hidden">
            {tasks.slice(0, 4).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenTask(t.id);
                }}
                title={t.title}
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${STATUS_STYLE[t.status]} hover:opacity-80`}
              >
                {t.identifier}
              </button>
            ))}
            {tasks.length > 4 && (
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                +{tasks.length - 4}
              </span>
            )}
          </div>
        )}
      </div>
      {/* ⋯ menu — outside the overflow-hidden inner div so its dropdown
          can extend below the card's bottom edge without being clipped. */}
      <div className="absolute top-1.5 right-1.5">
        <NodeActionsMenu
          goal={goal}
          workspaceId={workspaceId}
          forceVisible={menuVisible}
          setForceVisible={setMenuVisible}
        />
      </div>
      {/* Right-edge ⊕ — anchored to mid-height so the connector lands
          where the eye expects. Always visible (primary action). */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onAddSubGoal();
        }}
        title="Add sub-goal"
        aria-label="Add sub-goal"
        className="absolute top-1/2 -translate-y-1/2 -right-3 w-6 h-6 rounded-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 shadow-sm flex items-center justify-center text-sm leading-none"
      >
        +
      </button>
    </div>
  );
}

function GhostNode({
  parentGoalId,
  workspaceId,
  onDone,
}: {
  parentGoalId: string | null;
  workspaceId: string;
  onDone: () => void;
}) {
  const create = useCreateGoal(workspaceId);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function commit() {
    const trimmed = title.trim();
    if (!trimmed) {
      onDone();
      return;
    }
    try {
      await create.mutateAsync({
        title: trimmed,
        parent_goal_id: parentGoalId,
      });
      onDone();
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to create goal";
      toast.error(detail);
      onDone();
    }
  }

  return (
    <div
      className="absolute rounded-md border-2 border-dashed border-blue-300 bg-blue-50/30 p-2"
      style={{ width: NODE_W, height: NODE_H }}
    >
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="New goal title…"
        maxLength={200}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            onDone();
          }
        }}
        className="w-full bg-transparent text-sm font-medium text-slate-900 dark:text-slate-100 outline-none placeholder:text-slate-400"
      />
      <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
        Enter to save · Esc to cancel
      </p>
    </div>
  );
}

export function GoalMindMap({
  workspaceId,
  onOpenTask,
}: {
  workspaceId: string;
  onOpenTask: (taskId: string) => void;
}) {
  const { data: goals = [] } = useGoals(workspaceId);
  const { data: tasks = [] } = useWorkspaceTasks(workspaceId);
  // `addingFor` carries the parent-goal-id under which a ghost input is
  // currently shown. "root" = creating a new top-level goal.
  const [addingFor, setAddingFor] = useState<string | "root" | null>(null);
  // Which goals the user has explicitly expanded. Default: empty — only
  // top-level goals show, drill down by clicking a card. This keeps a
  // large workspace's tree scannable on first load.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Map of parent_goal_id → direct child count. Driven by the goal list,
  // independent of layout, so cards know whether to show the disclosure
  // chevron even when collapsed.
  const childCountByParent = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of goals) {
      if (!g.parent_goal_id) continue;
      m.set(g.parent_goal_id, (m.get(g.parent_goal_id) ?? 0) + 1);
    }
    return m;
  }, [goals]);

  function toggleExpand(goalId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(goalId)) next.delete(goalId);
      else next.add(goalId);
      return next;
    });
  }

  function startAddSubGoal(goalId: string) {
    // Implicit expand — without this the ghost input would render but
    // the parent would still LOOK collapsed (chevron pointing right),
    // which is confusing. After commit the parent stays expanded so the
    // new sub-goal stays visible.
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(goalId);
      return next;
    });
    setAddingFor(goalId);
  }

  const tasksByGoal = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.goal_id) continue;
      const arr = m.get(t.goal_id) ?? [];
      arr.push(t);
      m.set(t.goal_id, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    return m;
  }, [tasks]);

  const layout = useMemo(
    () => buildLayout(goals, addingFor, expanded),
    [goals, addingFor, expanded],
  );

  if (goals.length === 0 && addingFor !== "root") {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-10 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No goals yet. Start your strategy tree.
        </p>
        <button
          type="button"
          onClick={() => setAddingFor("root")}
          className="mt-3 inline-flex items-center gap-1 rounded-full bg-slate-900 text-white px-3 py-1 text-xs"
        >
          + New goal
        </button>
      </div>
    );
  }

  // Build the list of (parent, child) pairs for connector rendering.
  const connectors: { from: LayoutNode; to: LayoutNode }[] = [];
  for (const n of layout.nodes.values()) {
    for (const ck of n.childKeys) {
      const child = layout.nodes.get(ck);
      if (child) connectors.push({ from: n, to: child });
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-auto">
      <div className="flex items-center justify-end px-3 py-1.5 border-b border-slate-100 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setAddingFor("root")}
          className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
        >
          + New top-level goal
        </button>
      </div>
      <div
        className="relative"
        style={{
          width: Math.max(layout.width, 400),
          height: Math.max(layout.height, 200),
        }}
      >
        {/* Connectors layer — SVG covers the whole canvas so paths can be
            drawn in absolute coords. Pointer-events-none so the cards
            above stay clickable. */}
        <svg
          width={Math.max(layout.width, 400)}
          height={Math.max(layout.height, 200)}
          className="absolute inset-0 pointer-events-none"
        >
          {connectors.map((c, i) => (
            <path
              key={i}
              d={connectorPath(c.from, c.to)}
              fill="none"
              stroke="#cbd5e1"
              strokeWidth={1.5}
            />
          ))}
        </svg>
        {/* Nodes layer */}
        {Array.from(layout.nodes.values()).map((n) => (
          <div
            key={n.key}
            style={{ position: "absolute", left: n.x, top: n.y }}
          >
            {n.goal ? (
              <GoalNodeCard
                goal={n.goal}
                workspaceId={workspaceId}
                tasks={tasksByGoal.get(n.goal.id) ?? []}
                childCount={childCountByParent.get(n.goal.id) ?? 0}
                expanded={expanded.has(n.goal.id)}
                onToggle={() => toggleExpand(n.goal!.id)}
                onAddSubGoal={() => startAddSubGoal(n.goal!.id)}
                onOpenTask={onOpenTask}
              />
            ) : (
              <GhostNode
                parentGoalId={n.parentGoalId}
                workspaceId={workspaceId}
                onDone={() => setAddingFor(null)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
