import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { SquarePen } from "lucide-react";
import { toast } from "sonner";
import { useParams } from "react-router-dom";

import { AssigneePicker } from "@/components/AssigneePicker";
import { Avatar } from "@/components/Avatar";
import { InlineTaskCreator } from "@/components/InlineTaskCreator";
import { PriorityIcon } from "@/components/PriorityIcon";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { parseDueDate } from "@/lib/date";
import { STATUS, STATUS_ORDER } from "@/features/tasks/labels";
import { useBlockedTaskIds } from "@/features/dependencies/api";
import { type Member, useMembers } from "@/features/members/api";
import {
  Task,
  TaskPriority,
  TaskStatus,
  useMoveTask,
  useTasks,
  useUpdateTask,
} from "@/features/tasks/api";
import { useProjects } from "@/features/projects/api";
import { useProjectTasksRealtime } from "@/features/realtime/useProjectTasksRealtime";
import { isDependenciesEnabled, useWorkspaces } from "@/features/workspaces/api";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

// Columns derive from the canonical STATUS_ORDER in labels.ts. Adding a
// status anywhere in the app updates the board automatically.
const COLUMNS: { status: TaskStatus; label: string }[] = STATUS_ORDER.map((s) => ({
  status: s,
  label: STATUS[s].label,
}));

// Columns hidden by default on first visit (user can toggle in the menu).
// Cancelled is noise on a working board — opt-in via the menu.
const DEFAULT_HIDDEN: TaskStatus[] = ["cancelled"];

// Custom collision strategy for the kanban: prefer whichever droppable
// the pointer is INSIDE (a column, or a card within a column). Falls
// back to nearest-center if the pointer happens to be over a gap. The
// default `closestCorners` strategy picks the nearest droppable corner,
// which mis-targets an empty column when a neighbour column has cards
// — the neighbour card's corner is closer than the empty column's
// outer corner, so cross-column drops to empty columns get routed to
// the wrong column.
const collisionStrategy: CollisionDetection = (args) => {
  const inside = pointerWithin(args);
  if (inside.length > 0) return inside;
  return closestCenter(args);
};

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <PriorityIcon priority={priority} hideNoPriority />;
}

function CalendarIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="w-3 h-3"
    >
      <path
        fillRule="evenodd"
        d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ColumnsIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
    >
      <rect x="3" y="4.5" width="18" height="15" rx="1.5" />
      <path d="M9 4.5v15M15 4.5v15" />
    </svg>
  );
}

function useHiddenColumns(projectId: string) {
  const key = projectId ? `tracker.board.hidden.${projectId}` : "";
  const [hidden, setHidden] = useState<Set<TaskStatus>>(() => {
    if (!key) return new Set(DEFAULT_HIDDEN);
    try {
      const raw = localStorage.getItem(key);
      return raw
        ? new Set(JSON.parse(raw) as TaskStatus[])
        : new Set(DEFAULT_HIDDEN);
    } catch {
      return new Set(DEFAULT_HIDDEN);
    }
  });

  useEffect(() => {
    if (!key) return;
    localStorage.setItem(key, JSON.stringify([...hidden]));
  }, [key, hidden]);

  return [hidden, setHidden] as const;
}

function ColumnVisibilityMenu({
  hidden,
  onToggle,
}: {
  hidden: Set<TaskStatus>;
  onToggle: (status: TaskStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-7 items-center gap-1.5 text-xs text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-100 border border-slate-200 dark:border-neutral-700 hover:border-slate-300 dark:hover:border-neutral-600 rounded-full px-2.5 transition-colors"
      >
        <ColumnsIcon />
        <span>Columns</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-neutral-900 rounded-md border border-slate-200 dark:border-neutral-800 shadow-lg z-10 py-1">
          {COLUMNS.map((col) => (
            <label
              key={col.status}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600 dark:text-neutral-400 hover:bg-slate-50 dark:hover:bg-neutral-800/50 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={!hidden.has(col.status)}
                onChange={() => onToggle(col.status)}
                className="rounded border-slate-300 dark:border-neutral-700"
              />
              <span>{col.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function DueDateBadge({ date, status }: { date: string; status?: TaskStatus }) {
  // Done / cancelled tasks: due date is informational only, no overdue
  // red or soon-amber. Linear / Jira / Asana all follow this convention.
  const completed = status === "done" || status === "cancelled";
  const due = parseDueDate(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdue = !completed && due.getTime() < today.getTime();
  const soon =
    !completed &&
    !overdue &&
    due.getTime() - today.getTime() < 3 * 24 * 60 * 60 * 1000;
  const cls = overdue
    ? "text-red-500 dark:text-red-400"
    : soon
      ? "text-amber-600"
      : "text-slate-500 dark:text-neutral-400";
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] ${cls}`}>
      <CalendarIcon />
      {due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
    </span>
  );
}

// Small amber pill flagging a task that has at least one OPEN blocker
// (a linked task whose status isn't done/cancelled). Same visual weight
// as Priority/Due so it sits alongside them in the meta row, but warm
// enough to draw the eye when scanning a column.
function BlockedBadge() {
  return (
    <span
      title="Blocked by another task"
      className="inline-flex items-center justify-center text-amber-600 dark:text-amber-400"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-3.5 h-3.5"
        aria-hidden
      >
        <rect x="5" y="11" width="14" height="9" rx="1.5" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
    </span>
  );
}

function CardBody({
  task,
  assignee,
  members,
  interactive = true,
}: {
  task: Task;
  assignee: Member | undefined;
  members: Member[];
  interactive?: boolean;
}) {
  // Lookup the workspace's "currently blocked" set — React Query dedupes
  // across every card subscribing, so this is one network call regardless
  // of how many cards are on screen.
  const { data: workspaces = [] } = useWorkspaces();
  const depsEnabled = isDependenciesEnabled(
    workspaces.find((w) => w.id === task.workspace_id),
  );
  const { data: blockedIds } = useBlockedTaskIds(task.workspace_id);
  // Dependencies is an opt-out workspace feature — when disabled, don't show
  // the blocked badge (the data/relationships are preserved).
  const isBlocked = depsEnabled && (blockedIds?.has(task.id) ?? false);

  // Inline title editing — only on interactive cards (not the drag
  // preview). Click the title text to swap the <div> for a <textarea>;
  // Enter / blur commits via useUpdateTask, Esc cancels. stopPropagation
  // on the textarea pointer events prevents drag from kicking in while
  // editing, and on the title's onClick prevents the card-level click
  // (which opens TaskDetailModal) from firing.
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const updateMutation = useUpdateTask(task.id);

  // Keep the draft in sync with task.title when not actively editing
  // (covers realtime updates from other users / the modal).
  useEffect(() => {
    if (!titleEditing) setTitleDraft(task.title);
  }, [task.title, titleEditing]);

  async function commitTitle() {
    const next = titleDraft.trim();
    if (!next || next === task.title) {
      setTitleDraft(task.title);
      setTitleEditing(false);
      return;
    }
    try {
      await updateMutation.mutateAsync({ title: next });
    } catch {
      setTitleDraft(task.title);
      toast.error("Failed to update title");
    }
    setTitleEditing(false);
  }

  // Title typographic style — kept as Geist (the UI font) with a heavier
  // weight so it reads as title without introducing a second font family.
  // Mixing a serif here meant CJK characters fell back to system sans
  // while Latin chars rendered serif — same card, two fonts, looked
  // unintentional.
  const titleClass =
    "text-[16px] font-normal tracking-tight text-slate-700 dark:text-neutral-200 leading-snug";

  return (
    <>
      {titleEditing && interactive ? (
        <textarea
          autoFocus
          value={titleDraft}
          onChange={(e) => {
            setTitleDraft(e.target.value);
            // auto-grow so wrapping titles don't get clipped
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onFocus={(e) => {
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
            // place caret at end (default would select-all from autoFocus)
            const len = e.target.value.length;
            e.target.setSelectionRange(len, len);
          }}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commitTitle();
            } else if (e.key === "Escape") {
              setTitleDraft(task.title);
              setTitleEditing(false);
            }
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          rows={1}
          maxLength={500}
          className={`${titleClass} w-full bg-transparent outline-none resize-none border-0 p-0 focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-700 rounded`}
        />
      ) : (
        // Jira-style: title text stays a passive label (clicking the card
        // — including the title — opens the detail modal). The explicit
        // edit affordance is a Pencil icon that appears on card hover
        // immediately after the title. Click it to enter inline edit.
        <div className={`${titleClass} inline`}>
          <span>{task.title}</span>
          {interactive && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setTitleDraft(task.title);
                setTitleEditing(true);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              title="Edit title"
              aria-label="Edit title"
              className="ml-1.5 inline-flex items-center align-[-2px] opacity-0 group-hover/card:opacity-100 focus:opacity-100 text-slate-400 dark:text-neutral-500 hover:text-slate-700 dark:hover:text-neutral-300 transition-opacity"
            >
              <SquarePen className="w-3.5 h-3.5" aria-hidden />
            </button>
          )}
        </div>
      )}
      {/* Due date — its own line above the ID. Date is more scannable
          when it gets its own row instead of mixing with the mono ID
          and the blocked icon. Skipped entirely when the task has no
          due date so cards without one stay compact. */}
      {task.due_date && (
        <div className="mt-2 flex items-center">
          <DueDateBadge date={task.due_date} status={task.status} />
        </div>
      )}
      {/* Bottom meta row — always renders because the identifier always
          exists. Left cluster: ID + Blocked icon. Right cluster:
          Priority + Avatar (status of this task right now). Priority
          sits immediately to the avatar's left so the two move together
          as the "who/how urgent" pair. */}
      <div
        className={`${task.due_date ? "mt-1" : "mt-2"} flex items-center justify-between gap-2`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-mono text-[10px] text-slate-400 dark:text-neutral-500 tracking-wide">
            {task.identifier}
          </span>
          {isBlocked && <BlockedBadge />}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <PriorityBadge priority={task.priority} />
          {interactive ? (
            <AssigneePicker
              taskId={task.id}
              currentAssigneeId={task.assignee_id}
              members={members}
            >
              {({ open, triggerRef }) => (
                <button
                  ref={triggerRef}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    open();
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="shrink-0 hover:ring-2 hover:ring-blue-300 rounded-full transition-shadow"
                  title={
                    assignee
                      ? `Assigned to ${assignee.display_name || assignee.email}`
                      : "Click to assign"
                  }
                >
                  {assignee ? (
                    <Avatar
                      displayName={assignee.display_name}
                      email={assignee.email}
                      avatarUrl={assignee.avatar_url}
                      color={assignee.avatar_color}
                      size={22}
                    />
                  ) : (
                    <div className="w-[22px] h-[22px] rounded-full border-2 border-dashed border-slate-300 dark:border-neutral-700 hover:border-slate-500 transition-colors" />
                  )}
                </button>
              )}
            </AssigneePicker>
          ) : assignee ? (
            <Avatar
              displayName={assignee.display_name}
              email={assignee.email}
              avatarUrl={assignee.avatar_url}
              color={assignee.avatar_color}
              size={22}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}

function SortableCard({
  task,
  assignee,
  members,
  onOpen,
}: {
  task: Task;
  assignee: Member | undefined;
  members: Member[];
  onOpen: (taskId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
      }}
      className="group/card rounded-md border border-slate-200/80 dark:border-transparent bg-white dark:bg-neutral-800 p-2.5 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-slate-300 dark:hover:border-neutral-700 select-none transition-all duration-150"
      {...attributes}
      {...listeners}
      onClick={() => {
        if (!isDragging) onOpen(task.id);
      }}
    >
      <CardBody task={task} assignee={assignee} members={members} />
    </div>
  );
}

// Subtle insertion indicator shown in the gap where the dragged task will
// land. A thin, soft-blue hairline; negative margins keep it inside the
// space-y gap so it doesn't push cards around.
function DropLine() {
  return <div className="h-0.5 -my-1 bg-blue-400/40 rounded-full" />;
}

function Column({
  col,
  items,
  memberById,
  members,
  isDropTarget,
  overId,
  draggedId,
  onOpen,
  projectId,
}: {
  col: { status: TaskStatus; label: string };
  items: Task[];
  memberById: Map<string, Member>;
  members: Member[];
  isDropTarget: boolean;
  // Current drop target (card id or column status), null when not dragging.
  overId: string | null;
  draggedId: string | null;
  onOpen: (taskId: string) => void;
  projectId: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.status });
  const highlight = isOver || isDropTarget;
  // Insertion line shows above the hovered card, or at the column end when
  // the column itself is the drop target. Suppressed for the dragged card's
  // own slot (dropping onto itself is a no-op in onDragEnd).
  const lineAtEnd = overId === col.status && items.length > 0;

  return (
    <div
      ref={setNodeRef}
      className={`group rounded-lg p-2 min-h-[120px] flex flex-col transition-colors ${
        highlight
          ? "bg-blue-50 dark:bg-blue-950/30 ring-2 ring-inset ring-blue-300 dark:ring-blue-700"
          : "bg-slate-100 dark:bg-neutral-900"
      }`}
    >
      <div className="mb-2 px-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600 dark:text-neutral-400">
        <span>{col.label}</span>
        <span className="text-slate-400 dark:text-neutral-500 font-medium tracking-normal normal-case">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        // Empty column: put the affordance right under the header so it
        // doesn't float at the bottom of a tall empty box.
        <InlineTaskCreator
          projectId={projectId}
          status={col.status}
          triggerClassName="w-full text-left text-xs text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-100 hover:bg-slate-200/60 rounded px-2 py-1.5 transition-opacity opacity-0 group-hover:opacity-100"
        />
      ) : (
        <>
          <SortableContext
            items={items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2 min-h-[40px]">
              {items.map((task) => (
                <Fragment key={task.id}>
                  {overId === task.id && task.id !== draggedId && <DropLine />}
                  <SortableCard
                    task={task}
                    assignee={
                      task.assignee_id
                        ? memberById.get(task.assignee_id)
                        : undefined
                    }
                    members={members}
                    onOpen={onOpen}
                  />
                </Fragment>
              ))}
              {lineAtEnd && <DropLine />}
            </div>
          </SortableContext>
          <div className="mt-2">
            <InlineTaskCreator
              projectId={projectId}
              status={col.status}
              triggerClassName="w-full text-left text-xs text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-100 hover:bg-slate-200/60 rounded px-2 py-1.5 transition-colors"
            />
          </div>
        </>
      )}
    </div>
  );
}

export default function Board() {
  useDocumentTitle("Board");
  const { wsSlug, pKey } = useParams();

  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const { data: projects = [] } = useProjects(currentWs?.id ?? "");
  const currentProject = projects.find((p) => p.key === pKey);
  const { data: tasks = [] } = useTasks(currentProject?.id ?? "");
  const { data: members = [] } = useMembers(currentWs?.id ?? "");
  const moveMutation = useMoveTask(currentProject?.id ?? "");
  useProjectTasksRealtime(currentProject?.id);

  const memberById = useMemo(() => {
    const m = new Map<string, Member>();
    for (const mb of members) m.set(mb.user_id, mb);
    return m;
  }, [members]);

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [activeColumn, setActiveColumn] = useState<TaskStatus | null>(null);
  // The current drop target (a card id or a column status). The insertion
  // line mirrors this exactly — onDragEnd lands the task above the over
  // card, or at the column end when over is the column — so the line and
  // the actual landing spot can't disagree.
  const [overId, setOverId] = useState<string | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [hiddenColumns, setHiddenColumns] = useHiddenColumns(
    currentProject?.id ?? "",
  );

  const visibleColumns = useMemo(
    () => COLUMNS.filter((c) => !hiddenColumns.has(c.status)),
    [hiddenColumns],
  );

  const toggleColumn = (status: TaskStatus) => {
    const next = new Set(hiddenColumns);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    setHiddenColumns(next);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
  );

  function tasksByStatus(s: TaskStatus) {
    return tasks
      .filter((i) => i.status === s)
      .sort((a, b) => a.position - b.position);
  }

  function findTask(id: string) {
    return tasks.find((i) => i.id === id);
  }

  function onDragStart(e: DragStartEvent) {
    const t = findTask(String(e.active.id));
    if (t) {
      setActiveTask(t);
      setActiveColumn(t.status);
    }
  }

  function onDragOver(e: { over: { id: string | number } | null }) {
    if (!e.over) {
      setActiveColumn(null);
      setOverId(null);
      return;
    }
    const id = String(e.over.id);
    setOverId(id);
    if (COLUMNS.some((c) => c.status === id)) {
      setActiveColumn(id as TaskStatus);
    } else {
      const t = findTask(id);
      if (t) setActiveColumn(t.status);
    }
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveTask(null);
    setActiveColumn(null);
    setOverId(null);
    const { active, over } = e;
    if (!over) return;

    const dragged = findTask(String(active.id));
    if (!dragged) return;

    // Both are assigned in every non-return branch below — declared without
    // initial values so eslint's no-useless-assignment is happy.
    let newStatus: TaskStatus;
    let newPosition: number;

    const overId = String(over.id);
    const overTask = findTask(overId);

    if (overTask) {
      newStatus = overTask.status;
      const column = tasksByStatus(newStatus);
      const overIndex = column.findIndex((i) => i.id === overTask.id);
      const draggedIndex = column.findIndex((i) => i.id === dragged.id);

      if (draggedIndex === -1) {
        const prev = column[overIndex - 1];
        const next = column[overIndex];
        newPosition = prev
          ? (prev.position + next.position) / 2
          : next.position - 1000;
      } else if (draggedIndex !== overIndex) {
        const filtered = column.filter((i) => i.id !== dragged.id);
        const targetIndex = filtered.findIndex((i) => i.id === overTask.id);
        const prev = filtered[targetIndex - 1];
        const next = filtered[targetIndex];
        newPosition =
          prev && next
            ? (prev.position + next.position) / 2
            : prev
              ? prev.position + 1000
              : next
                ? next.position - 1000
                : 0;
      } else {
        return;
      }
    } else if (COLUMNS.some((c) => c.status === overId)) {
      newStatus = overId as TaskStatus;
      if (newStatus === dragged.status) return;
      const column = tasksByStatus(newStatus);
      newPosition =
        column.length > 0 ? column[column.length - 1].position + 1000 : 0;
    } else {
      return;
    }

    if (newStatus === dragged.status && newPosition === dragged.position) {
      return;
    }

    moveMutation.mutate({
      taskId: dragged.id,
      status: newStatus,
      position: newPosition,
    });
  }

  function onDragCancel() {
    setActiveTask(null);
    setActiveColumn(null);
    setOverId(null);
  }

  if (!currentProject) return null;

  return (
    <div>
      <div className="flex items-center justify-end mb-2">
        <ColumnVisibilityMenu hidden={hiddenColumns} onToggle={toggleColumn} />
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionStrategy}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
        autoScroll={{ acceleration: 1000, threshold: { x: 0.2, y: 0.2 } }}
      >
        <div className="overflow-x-auto scrollbar-hide px-1 pb-2">
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${Math.max(visibleColumns.length, 1)}, minmax(240px, 1fr))`,
            }}
          >
            {visibleColumns.map((col) => (
              <Column
                key={col.status}
                col={col}
                items={tasksByStatus(col.status)}
                memberById={memberById}
                members={members}
                isDropTarget={
                  activeColumn === col.status &&
                  activeTask?.status !== col.status
                }
                overId={activeTask ? overId : null}
                draggedId={activeTask?.id ?? null}
                onOpen={setOpenTaskId}
                projectId={currentProject.id}
              />
            ))}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <div className="rounded-md border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2.5 shadow-2xl cursor-grabbing rotate-1">
              <CardBody
                task={activeTask}
                assignee={
                  activeTask.assignee_id
                    ? memberById.get(activeTask.assignee_id)
                    : undefined
                }
                members={members}
                interactive={false}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <TaskDetailModal
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
      />
    </div>
  );
}
