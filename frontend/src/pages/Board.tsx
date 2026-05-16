import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { InlineTaskCreator } from "@/components/InlineTaskCreator";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { PRIORITY_STYLE } from "@/features/tasks/labels";
import { useMembers } from "@/features/members/api";
import {
  Task,
  TaskPriority,
  TaskStatus,
  useMoveTask,
  useTasks,
} from "@/features/tasks/api";
import { useProjects } from "@/features/projects/api";
import { useProjectTasksRealtime } from "@/features/realtime/useProjectTasksRealtime";
import { useWorkspaces } from "@/features/workspaces/api";

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "backlog", label: "Backlog" },
  { status: "todo", label: "To do" },
  { status: "in_progress", label: "In progress" },
  { status: "in_review", label: "In review" },
  { status: "done", label: "Done" },
  { status: "cancelled", label: "Cancelled" },
];

// Columns hidden by default on first visit (user can toggle in the menu).
// Cancelled is noise on a working board — opt-in via the menu.
const DEFAULT_HIDDEN: TaskStatus[] = ["cancelled"];

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  if (priority === "no_priority" || priority === "low") return null;
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PRIORITY_STYLE[priority]}`}
    >
      {priority}
    </span>
  );
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
      viewBox="0 0 20 20"
      fill="currentColor"
      className="w-4 h-4"
    >
      <path
        fillRule="evenodd"
        d="M3 4.5A1.5 1.5 0 0 1 4.5 3h2A1.5 1.5 0 0 1 8 4.5v11A1.5 1.5 0 0 1 6.5 17h-2A1.5 1.5 0 0 1 3 15.5v-11Zm6 0A1.5 1.5 0 0 1 10.5 3h2A1.5 1.5 0 0 1 14 4.5v11a1.5 1.5 0 0 1-1.5 1.5h-2A1.5 1.5 0 0 1 9 15.5v-11Zm6.5-1.5A1.5 1.5 0 0 0 14 4.5v11a1.5 1.5 0 0 0 1.5 1.5H17V3h-1.5Z"
        clipRule="evenodd"
      />
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
        className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md px-2.5 py-1.5 transition-colors"
      >
        <ColumnsIcon />
        <span>Columns</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-48 bg-white rounded-md border border-slate-200 shadow-lg z-10 py-1">
          {COLUMNS.map((col) => (
            <label
              key={col.status}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600 hover:bg-slate-50 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={!hidden.has(col.status)}
                onChange={() => onToggle(col.status)}
                className="rounded border-slate-300"
              />
              <span>{col.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function DueDateBadge({ date }: { date: string }) {
  const due = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdue = due.getTime() < today.getTime();
  const soon =
    !overdue && due.getTime() - today.getTime() < 3 * 24 * 60 * 60 * 1000;
  const cls = overdue
    ? "text-red-600"
    : soon
      ? "text-amber-600"
      : "text-slate-500";
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] ${cls}`}>
      <CalendarIcon />
      {due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
    </span>
  );
}

function Avatar({ email, size = 22 }: { email: string; size?: number }) {
  const initial = (email[0] ?? "?").toUpperCase();
  const hue =
    Array.from(email).reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div
      title={email}
      style={{
        width: size,
        height: size,
        backgroundColor: `hsl(${hue} 55% 50%)`,
      }}
      className="rounded-full flex items-center justify-center text-white text-[10px] font-semibold shrink-0 ring-2 ring-white"
    >
      {initial}
    </div>
  );
}

function CardBody({
  task,
  assigneeEmail,
}: {
  task: Task;
  assigneeEmail: string | undefined;
}) {
  // Show meta row only if there's something to show — otherwise the title
  // is the entire card (cleaner for unprioritized, undated, unassigned tasks).
  const hasMeta =
    (task.priority !== "no_priority" && task.priority !== "low") ||
    task.due_date ||
    assigneeEmail;

  return (
    <>
      <div className="text-sm text-slate-800 leading-snug">{task.title}</div>
      {hasMeta && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <PriorityBadge priority={task.priority} />
            {task.due_date && <DueDateBadge date={task.due_date} />}
          </div>
          {assigneeEmail ? <Avatar email={assigneeEmail} /> : null}
        </div>
      )}
    </>
  );
}

function SortableCard({
  task,
  assigneeEmail,
  onOpen,
}: {
  task: Task;
  assigneeEmail: string | undefined;
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
      className="rounded border border-slate-200 bg-white p-2.5 cursor-grab active:cursor-grabbing hover:border-slate-300 hover:shadow-sm select-none transition-shadow"
      {...attributes}
      {...listeners}
      onClick={() => {
        if (!isDragging) onOpen(task.id);
      }}
    >
      <CardBody task={task} assigneeEmail={assigneeEmail} />
    </div>
  );
}

function Column({
  col,
  items,
  emailById,
  isDropTarget,
  onOpen,
  projectId,
}: {
  col: { status: TaskStatus; label: string };
  items: Task[];
  emailById: Map<string, string>;
  isDropTarget: boolean;
  onOpen: (taskId: string) => void;
  projectId: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.status });
  const highlight = isOver || isDropTarget;

  return (
    <div
      ref={setNodeRef}
      className={`group rounded-lg p-2 min-h-[120px] flex flex-col transition-colors ${
        highlight
          ? "bg-blue-50 ring-2 ring-blue-300"
          : "bg-slate-100"
      }`}
    >
      <div className="mb-2 px-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
        <span>{col.label}</span>
        <span className="text-slate-400 font-medium tracking-normal normal-case">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        // Empty column: put the affordance right under the header so it
        // doesn't float at the bottom of a tall empty box.
        <InlineTaskCreator
          projectId={projectId}
          status={col.status}
          triggerClassName="w-full text-left text-xs text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 rounded px-2 py-1.5 transition-opacity opacity-0 group-hover:opacity-100"
        />
      ) : (
        <>
          <SortableContext
            items={items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2 min-h-[40px] flex-1">
              {items.map((task) => (
                <SortableCard
                  key={task.id}
                  task={task}
                  assigneeEmail={
                    task.assignee_id
                      ? emailById.get(task.assignee_id)
                      : undefined
                  }
                  onOpen={onOpen}
                />
              ))}
            </div>
          </SortableContext>
          <div className="mt-2">
            <InlineTaskCreator
              projectId={projectId}
              status={col.status}
              triggerClassName="w-full text-left text-xs text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 rounded px-2 py-1.5 transition-colors"
            />
          </div>
        </>
      )}
    </div>
  );
}

export default function Board() {
  const { wsSlug, pKey } = useParams();

  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const { data: projects = [] } = useProjects(currentWs?.id ?? "");
  const currentProject = projects.find((p) => p.key === pKey);
  const { data: tasks = [] } = useTasks(currentProject?.id ?? "");
  const { data: members = [] } = useMembers(currentWs?.id ?? "");
  const moveMutation = useMoveTask(currentProject?.id ?? "");
  useProjectTasksRealtime(currentProject?.id);

  const emailById = useMemo(() => {
    const m = new Map<string, string>();
    for (const mb of members) if (mb.email) m.set(mb.user_id, mb.email);
    return m;
  }, [members]);

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [activeColumn, setActiveColumn] = useState<TaskStatus | null>(null);
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
      return;
    }
    const overId = String(e.over.id);
    if (COLUMNS.some((c) => c.status === overId)) {
      setActiveColumn(overId as TaskStatus);
    } else {
      const t = findTask(overId);
      if (t) setActiveColumn(t.status);
    }
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveTask(null);
    setActiveColumn(null);
    const { active, over } = e;
    if (!over) return;

    const dragged = findTask(String(active.id));
    if (!dragged) return;

    let newStatus: TaskStatus = dragged.status;
    let newPosition = dragged.position;

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
  }

  if (!currentProject) return null;

  return (
    <div>
      <div className="flex items-center justify-end h-9 mb-2">
        <ColumnVisibilityMenu hidden={hiddenColumns} onToggle={toggleColumn} />
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
        autoScroll={{ acceleration: 1000, threshold: { x: 0.2, y: 0.2 } }}
      >
        <div className="overflow-x-auto scrollbar-hide p-1 pb-2">
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
                emailById={emailById}
                isDropTarget={
                  activeColumn === col.status &&
                  activeTask?.status !== col.status
                }
                onOpen={setOpenTaskId}
                projectId={currentProject.id}
              />
            ))}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <div className="rounded border border-slate-300 bg-white p-2.5 shadow-xl cursor-grabbing rotate-1">
              <CardBody
                task={activeTask}
                assigneeEmail={
                  activeTask.assignee_id
                    ? emailById.get(activeTask.assignee_id)
                    : undefined
                }
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
