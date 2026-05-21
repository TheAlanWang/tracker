// Sprint detail page.
//
// Routed under a project at /w/:wsSlug/p/:pKey/sprints/:sprintId. Shows the
// sprint's metadata (name, date range), a progress bar from its task stats,
// the task list, and lifecycle actions (Start, Complete, Delete).
//
// The sprint object loads asynchronously, so the editable drafts (name,
// start, end) are owned by an inner component that mounts fresh per sprint
// id — this lazy-initialises the drafts from the loaded sprint instead of
// hydrating via useEffect.

import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { BurndownChart } from "@/components/BurndownChart";
import { EmptyState } from "@/components/EmptyState";
import { PageSpinner } from "@/components/PageSpinner";
import { ExportTasksButton } from "@/components/ExportTasksButton";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { StatusPill } from "@/components/StatusPill";
import { TaskTableCard, TaskTableHead } from "@/components/TaskTableCard";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useTasks } from "@/features/tasks/api";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import {
  type Sprint,
  useCompleteSprint,
  useDeleteSprint,
  useSprint,
  useStartSprint,
  useUpdateSprint,
} from "@/features/sprints/api";

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function fmtFull(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const STATUS_STYLE: Record<string, string> = {
  planned: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300",
  active: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
};

export default function SprintDetail() {
  useDocumentTitle("Sprint");
  const { sprintId } = useParams();
  const { data: sprint } = useSprint(sprintId ?? "");

  if (!sprint) {
    return <PageSpinner />;
  }
  return <SprintDetailContent key={sprint.id} sprint={sprint} />;
}

function SprintDetailContent({ sprint }: { sprint: Sprint }) {
  const { wsSlug, pKey } = useParams();
  const navigate = useNavigate();
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const { data: tasks = [] } = useTasks(sprint.project_id, {
    sprint: sprint.id,
  });

  const updateMutation = useUpdateSprint(sprint.id);
  const startMutation = useStartSprint();
  const completeMutation = useCompleteSprint();
  const deleteMutation = useDeleteSprint();

  // Lazy-initialised drafts — fresh per sprint id (keyed remount above).
  const [nameDraft, setNameDraft] = useState(sprint.name);
  const [startDraft, setStartDraft] = useState(toDateInputValue(sprint.start_at));
  const [endDraft, setEndDraft] = useState(toDateInputValue(sprint.end_at));

  const taskStats = {
    total: tasks.length,
    done: tasks.filter((t) => t.status === "done").length,
    inProgress: tasks.filter((t) => t.status === "in_progress").length,
    todo: tasks.filter((t) => t.status === "todo" || t.status === "backlog")
      .length,
  };
  const progressPct =
    taskStats.total > 0 ? Math.round((taskStats.done / taskStats.total) * 100) : 0;

  function saveDate(field: "start_at" | "end_at", value: string) {
    const next = value || null;
    const current = field === "start_at" ? sprint.start_at : sprint.end_at;
    if (next === current) return;
    updateMutation.mutate({ [field]: next });
  }

  async function onStart() {
try {
      await startMutation.mutateAsync(sprint.id);
      toast.success(`Sprint ${sprint.name} started`);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to start sprint";
      toast.error(detail);
    }
  }

  async function onComplete() {
if (
      !confirm(
        `Complete ${sprint.name}? Unfinished tasks will roll over to the next planned sprint, or to the backlog.`,
      )
    )
      return;
    try {
      const result = await completeMutation.mutateAsync(sprint.id);
      toast.success(
        result.rolled_over_to
          ? `Completed. ${result.count} tasks rolled over.`
          : result.count
            ? `Completed. ${result.count} unfinished tasks moved to backlog.`
            : `Completed.`,
      );
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to complete sprint";
      toast.error(detail);
    }
  }

  async function onDelete() {
if (!confirm(`Delete ${sprint.name}?`)) return;
    try {
      await deleteMutation.mutateAsync(sprint.id);
      toast.success("Sprint deleted");
      navigate(`/w/${wsSlug}/p/${pKey}/sprints`);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to delete sprint";
      toast.error(detail);
    }
  }

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => navigate(`/w/${wsSlug}/p/${pKey}/sprints`)}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
      >
        ← Back to sprints
      </button>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              STATUS_STYLE[sprint.status] ?? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
            }`}
          >
            {sprint.status}
          </span>
        </div>
        <input
          className="w-full bg-transparent text-2xl font-bold text-slate-900 dark:text-slate-100 outline-none focus:bg-slate-100 rounded px-1 py-0.5 -mx-1"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => {
            if (nameDraft !== sprint.name && nameDraft.length > 0) {
              updateMutation.mutate({ name: nameDraft });
            }
          }}
        />
      </div>

      <div className="grid grid-cols-3 gap-4 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="space-y-1">
          <Label htmlFor="sprint-start" className="text-xs uppercase text-muted-foreground">
            Start date
          </Label>
          <input
            id="sprint-start"
            type="date"
            value={startDraft}
            onChange={(e) => setStartDraft(e.target.value)}
            onBlur={() => saveDate("start_at", startDraft)}
            className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sprint-end" className="text-xs uppercase text-muted-foreground">
            End date
          </Label>
          <input
            id="sprint-end"
            type="date"
            value={endDraft}
            onChange={(e) => setEndDraft(e.target.value)}
            onBlur={() => saveDate("end_at", endDraft)}
            className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <p className="text-xs uppercase text-muted-foreground">Created</p>
          <p className="text-sm text-slate-700 dark:text-slate-300 pt-1">{fmtFull(sprint.created_at)}</p>
        </div>
      </div>

      {taskStats.total > 0 && (
        <div className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase text-muted-foreground">
              Progress
            </h2>
            <span className="text-sm text-slate-700 dark:text-slate-300">
              {taskStats.done} / {taskStats.total} done · {progressPct}%
            </span>
          </div>
          <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            <span>{taskStats.todo} to do</span>
            <span>{taskStats.inProgress} in progress</span>
            <span>{taskStats.done} done</span>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {sprint.status === "planned" && (
          <Button onClick={onStart} disabled={startMutation.isPending}>
            {startMutation.isPending ? "Starting…" : "Start sprint"}
          </Button>
        )}
        {sprint.status === "active" && (
          <Button onClick={onComplete} disabled={completeMutation.isPending}>
            {completeMutation.isPending ? "Completing…" : "Complete sprint"}
          </Button>
        )}
        {sprint.status !== "active" && (
          <Button
            variant="outline"
            onClick={onDelete}
            className="text-red-600 hover:bg-red-50 ml-auto"
          >
            Delete
          </Button>
        )}
      </div>

      {sprint.start_at && sprint.end_at && (
        <section className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">
            Burndown
          </h2>
          <BurndownChart sprintId={sprint.id} />
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">
            Tasks ({tasks.length})
          </h2>
          {tasks.length > 0 && (
            <ExportTasksButton
              tasks={tasks}
              filename={`Sprint ${sprint.name}`}
            />
          )}
        </div>
        {tasks.length === 0 ? (
          <EmptyState
            size="compact"
            title="No tasks in this sprint"
            description="Drag tasks from the Backlog or assign them here from a task's detail page."
            icon={
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-5 h-5"
              >
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <line x1="9" y1="9" x2="15" y2="9" />
                <line x1="9" y1="13" x2="15" y2="13" />
                <line x1="9" y1="17" x2="13" y2="17" />
              </svg>
            }
          />
        ) : (
          <TaskTableCard>
            <TaskTableHead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="px-3 py-2.5 text-left whitespace-nowrap font-medium w-24">ID</th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap font-medium">Title</th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap font-medium w-32">Status</th>
              </tr>
            </TaskTableHead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {tasks.map((t) => (
                <tr
                  key={t.id}
                  className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  onClick={() => setOpenTaskId(t.id)}
                >
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                    {t.identifier}
                  </td>
                  <td className="px-3 py-2.5 text-slate-800 dark:text-slate-200" title={t.title}>
                    <div className="truncate">{t.title}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusPill status={t.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </TaskTableCard>
        )}
      </section>
      <TaskDetailModal
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
      />
    </div>
  );
}
