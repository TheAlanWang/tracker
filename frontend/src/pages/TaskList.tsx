import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  TaskStatus,
  useCreateTask,
  useTasks,
} from "@/features/tasks/api";
import { useProjects } from "@/features/projects/api";
import { useProjectTasksRealtime } from "@/features/realtime/useProjectTasksRealtime";
import { useWorkspaces } from "@/features/workspaces/api";

const STATUS_LABELS: Record<TaskStatus | "all", string> = {
  all: "All",
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In progress",
  in_review: "In review",
  done: "Done",
  cancelled: "Cancelled",
};

const STATUS_OPTIONS: (TaskStatus | "all")[] = [
  "all",
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "cancelled",
];

const PRIORITY_LABELS = {
  no_priority: "—",
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
} as const;

export default function TaskList() {
  const { wsSlug, pKey } = useParams();
  const navigate = useNavigate();

  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const { data: projects = [] } = useProjects(currentWs?.id ?? "");
  const currentProject = projects.find((p) => p.key === pKey);
  useProjectTasksRealtime(currentProject?.id);

  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const {
    data: tasks = [],
    isLoading,
  } = useTasks(currentProject?.id ?? "", {
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const createMutation = useCreateTask(currentProject?.id ?? "");
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const sortedTasks = useMemo(
    () =>
      [...tasks].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [tasks],
  );

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!currentProject) return;
    try {
      const task = await createMutation.mutateAsync({ title, description });
      toast.success(`Created ${task.identifier}`);
      setShowForm(false);
      setTitle("");
      setDescription("");
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to create task";
      toast.error(detail);
    }
  }

  if (!currentProject) return null;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-2">
          <select
            className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as TaskStatus | "all")
            }
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <Button onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "New task"}
          </Button>
        </div>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>New task</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onCreate} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="task-title">Title</Label>
                <Input
                  id="task-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  minLength={1}
                  maxLength={200}
                  placeholder="Set up authentication"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="task-desc">Description</Label>
                <textarea
                  id="task-desc"
                  className="w-full rounded border border-slate-300 bg-white p-2 text-sm"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={10000}
                />
              </div>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : "Create"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading && <p>Loading tasks…</p>}
      {!isLoading && sortedTasks.length === 0 && (
        <p className="text-muted-foreground">
          No tasks yet. Click "New task" to create one.
        </p>
      )}
      {sortedTasks.length > 0 && (
        <div className="overflow-hidden rounded border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium">ID</th>
                <th className="px-3 py-2 text-left font-medium">Title</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Priority</th>
                <th className="px-3 py-2 text-left font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {sortedTasks.map((t) => (
                <tr
                  key={t.id}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                  onClick={() =>
                    navigate(`/w/${wsSlug}/p/${pKey}/tasks/${t.identifier}`)
                  }
                >
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">
                    {t.identifier}
                  </td>
                  <td className="px-3 py-2">{t.title}</td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">
                      {STATUS_LABELS[t.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {PRIORITY_LABELS[t.priority]}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
