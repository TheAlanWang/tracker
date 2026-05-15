import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useTasks } from "@/features/tasks/api";
import {
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
  planned: "bg-slate-100 text-slate-700",
  active: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
};

export default function SprintDetail() {
  const { wsSlug, pKey, sprintId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const { data: sprint } = useSprint(sprintId ?? "");
  const { data: tasks = [] } = useTasks(sprint?.project_id ?? "", {
    sprint: sprintId,
  });

  const updateMutation = useUpdateSprint(sprintId ?? "");
  const startMutation = useStartSprint();
  const completeMutation = useCompleteSprint();
  const deleteMutation = useDeleteSprint();

  const [nameDraft, setNameDraft] = useState("");
  const [startDraft, setStartDraft] = useState("");
  const [endDraft, setEndDraft] = useState("");

  useEffect(() => {
    if (sprint) {
      setNameDraft(sprint.name);
      setStartDraft(toDateInputValue(sprint.start_at));
      setEndDraft(toDateInputValue(sprint.end_at));
    }
  }, [sprint]);

  if (!sprint) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

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
    const current = field === "start_at" ? sprint!.start_at : sprint!.end_at;
    if (next === current) return;
    updateMutation.mutate({ [field]: next });
  }

  async function onStart() {
    if (!sprint) return;
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
    if (!sprint) return;
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
    if (!sprint) return;
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
    <div className="space-y-6 max-w-5xl">
      <button
        type="button"
        onClick={() => navigate(`/w/${wsSlug}/p/${pKey}/sprints`)}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
      >
        ← Back to sprints
      </button>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              STATUS_STYLE[sprint.status] ?? "bg-slate-100 text-slate-700"
            }`}
          >
            {sprint.status}
          </span>
        </div>
        <input
          className="w-full bg-transparent text-2xl font-bold text-slate-900 outline-none focus:bg-slate-100 rounded px-1 py-0.5 -mx-1"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => {
            if (nameDraft !== sprint.name && nameDraft.length > 0) {
              updateMutation.mutate({ name: nameDraft });
            }
          }}
        />
      </div>

      <div className="grid grid-cols-3 gap-4 rounded border border-slate-200 bg-white p-4">
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
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
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
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <p className="text-xs uppercase text-muted-foreground">Created</p>
          <p className="text-sm text-slate-700 pt-1">{fmtFull(sprint.created_at)}</p>
        </div>
      </div>

      {taskStats.total > 0 && (
        <div className="rounded border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase text-muted-foreground">
              Progress
            </h2>
            <span className="text-sm text-slate-700">
              {taskStats.done} / {taskStats.total} done · {progressPct}%
            </span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500">
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

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">
          Tasks ({tasks.length})
        </h2>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks assigned.</p>
        ) : (
          <div className="overflow-hidden rounded border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">ID</th>
                  <th className="px-3 py-2 text-left font-medium">Title</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr
                    key={t.id}
                    className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                    onClick={() =>
                      navigate(`/w/${wsSlug}/p/${pKey}/tasks/${t.identifier}`, {
                        state: {
                          from: {
                            path: location.pathname,
                            label: sprint?.name ?? "Sprint",
                          },
                        },
                      })
                    }
                  >
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">
                      {t.identifier}
                    </td>
                    <td className="px-3 py-2">{t.title}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                        {t.status.replace(/_/g, " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
