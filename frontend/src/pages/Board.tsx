import {
  DndContext,
  DragEndEvent,
  PointerSensor,
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
import { useNavigate, useParams } from "react-router-dom";

import { Task, TaskStatus, useTasks, useMoveTask } from "@/features/tasks/api";
import { useProjects } from "@/features/projects/api";
import { useProjectTasksRealtime } from "@/features/realtime/useProjectTasksRealtime";
import { useWorkspaces } from "@/features/workspaces/api";

// Board shows only active work statuses. New tasks default to "backlog"
// (see TaskCreate.status default) and live in the /backlog page until
// someone moves them to "todo". "cancelled" tasks are hidden from the
// board too — they remain visible in the List view.
const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "todo", label: "Todo" },
  { status: "in_progress", label: "In progress" },
  { status: "in_review", label: "In review" },
  { status: "done", label: "Done" },
];

function SortableCard({
  issue,
  wsSlug,
  pKey,
}: {
  issue: Task;
  wsSlug: string;
  pKey: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: issue.id });
  const navigate = useNavigate();

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="rounded border border-slate-200 bg-white p-2 text-sm cursor-grab active:cursor-grabbing hover:border-slate-300 select-none"
      {...attributes}
      {...listeners}
      onClick={() => {
        if (!isDragging) {
          navigate(`/w/${wsSlug}/p/${pKey}/tasks/${issue.identifier}`);
        }
      }}
    >
      <div className="font-mono text-xs text-slate-500 mb-0.5">
        {issue.identifier}
      </div>
      <div className="text-slate-800 leading-snug">{issue.title}</div>
    </div>
  );
}

function Column({
  col,
  items,
  wsSlug,
  pKey,
}: {
  col: { status: TaskStatus; label: string };
  items: Task[];
  wsSlug: string;
  pKey: string;
}) {
  const { setNodeRef } = useDroppable({ id: col.status });

  return (
    <div
      ref={setNodeRef}
      className="rounded bg-slate-100 p-2 min-h-[200px] flex flex-col"
    >
      <div className="font-medium text-sm mb-2 px-1 flex items-center gap-1">
        <span>{col.label}</span>
        <span className="text-slate-400 font-normal">({items.length})</span>
      </div>
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2 min-h-[60px] flex-1">
          {items.map((issue) => (
            <SortableCard
              key={issue.id}
              issue={issue}
              wsSlug={wsSlug}
              pKey={pKey}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

export default function Board() {
  const { wsSlug, pKey } = useParams();

  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const { data: projects = [] } = useProjects(currentWs?.id ?? "");
  const currentProject = projects.find((p) => p.key === pKey);
  const { data: issues = [] } = useTasks(currentProject?.id ?? "");
  const moveMutation = useMoveTask(currentProject?.id ?? "");
  useProjectTasksRealtime(currentProject?.id);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function issuesByStatus(s: TaskStatus) {
    return issues
      .filter((i) => i.status === s)
      .sort((a, b) => a.position - b.position);
  }

  function findIssue(id: string) {
    return issues.find((i) => i.id === id);
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;

    const dragged = findIssue(String(active.id));
    if (!dragged) return;

    let newStatus: TaskStatus = dragged.status;
    let newPosition = dragged.position;

    const overId = String(over.id);
    const overIssue = findIssue(overId);

    if (overIssue) {
      // Dropped on a card in some column
      newStatus = overIssue.status;
      const column = issuesByStatus(newStatus);
      const overIndex = column.findIndex((i) => i.id === overIssue.id);
      const draggedIndex = column.findIndex((i) => i.id === dragged.id);

      if (draggedIndex === -1) {
        // Inserting from another column — insert before overIssue
        const prev = column[overIndex - 1];
        const next = column[overIndex];
        newPosition = prev
          ? (prev.position + next.position) / 2
          : next.position - 1000;
      } else if (draggedIndex !== overIndex) {
        // Reordering within same column
        const filtered = column.filter((i) => i.id !== dragged.id);
        const targetIndex = filtered.findIndex((i) => i.id === overIssue.id);
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
        // Same position — noop
        return;
      }
    } else if (COLUMNS.some((c) => c.status === overId)) {
      // Dropped on empty column container
      newStatus = overId as TaskStatus;
      if (newStatus === dragged.status) return;
      const column = issuesByStatus(newStatus);
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

  if (!currentProject) return null;

  return (
    <div className="space-y-4">
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-4 gap-3 min-h-[400px]">
          {COLUMNS.map((col) => (
            <Column
              key={col.status}
              col={col}
              items={issuesByStatus(col.status)}
              wsSlug={wsSlug ?? ""}
              pKey={pKey ?? ""}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
