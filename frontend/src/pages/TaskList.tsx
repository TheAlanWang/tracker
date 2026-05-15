import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
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
import { useMembers } from "@/features/members/api";
import { useSprints } from "@/features/sprints/api";
import {
  TaskPriority,
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
  todo: "To do",
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

const STATUS_STYLE: Record<TaskStatus, string> = {
  backlog: "bg-slate-100 text-slate-600",
  todo: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  in_review: "bg-purple-100 text-purple-700",
  done: "bg-green-100 text-green-700",
  cancelled: "bg-slate-100 text-slate-400",
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  no_priority: "—",
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  urgent: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-500",
  no_priority: "text-slate-400",
};

type ColKey =
  | "id"
  | "title"
  | "status"
  | "priority"
  | "assignee"
  | "due"
  | "sprint"
  | "created";

const COLUMNS: { key: ColKey; label: string }[] = [
  { key: "id", label: "ID" },
  { key: "title", label: "Title" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "assignee", label: "Assignee" },
  { key: "due", label: "Due" },
  { key: "sprint", label: "Sprint" },
  { key: "created", label: "Created" },
];

function useHiddenColumns(projectId: string) {
  const key = projectId ? `tracker.list.hidden.${projectId}` : "";
  const [hidden, setHidden] = useState<Set<ColKey>>(() => {
    if (!key) return new Set();
    try {
      const raw = localStorage.getItem(key);
      return raw ? new Set(JSON.parse(raw) as ColKey[]) : new Set();
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    if (!key) return;
    localStorage.setItem(key, JSON.stringify([...hidden]));
  }, [key, hidden]);
  return [hidden, setHidden] as const;
}

function ColumnsIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="w-3.5 h-3.5"
    >
      <path
        fillRule="evenodd"
        d="M3 4.5A1.5 1.5 0 0 1 4.5 3h2A1.5 1.5 0 0 1 8 4.5v11A1.5 1.5 0 0 1 6.5 17h-2A1.5 1.5 0 0 1 3 15.5v-11Zm6 0A1.5 1.5 0 0 1 10.5 3h2A1.5 1.5 0 0 1 14 4.5v11a1.5 1.5 0 0 1-1.5 1.5h-2A1.5 1.5 0 0 1 9 15.5v-11Zm6.5-1.5A1.5 1.5 0 0 0 14 4.5v11a1.5 1.5 0 0 0 1.5 1.5H17V3h-1.5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ColumnVisibilityMenu({
  hidden,
  onToggle,
}: {
  hidden: Set<ColKey>;
  onToggle: (key: ColKey) => void;
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
        className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded px-2 py-1 transition-colors"
      >
        <ColumnsIcon />
        <span>Columns</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-48 bg-white rounded-md border border-slate-200 shadow-lg z-10 py-1">
          {COLUMNS.map((c) => (
            <label
              key={c.key}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600 hover:bg-slate-50 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={!hidden.has(c.key)}
                onChange={() => onToggle(c.key)}
                className="rounded border-slate-300"
              />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function Avatar({ email }: { email: string }) {
  const initial = (email[0] ?? "?").toUpperCase();
  const hue =
    Array.from(email).reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div
      title={email}
      style={{ backgroundColor: `hsl(${hue} 55% 50%)` }}
      className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-semibold shrink-0"
    >
      {initial}
    </div>
  );
}

function DueDateCell({ date }: { date: string }) {
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
      : "text-slate-600";
  return (
    <span className={`text-xs ${cls}`}>
      {due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
    </span>
  );
}

export default function TaskList() {
  const { wsSlug, pKey } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const { data: projects = [] } = useProjects(currentWs?.id ?? "");
  const currentProject = projects.find((p) => p.key === pKey);
  useProjectTasksRealtime(currentProject?.id);

  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const { data: tasks = [], isLoading } = useTasks(currentProject?.id ?? "", {
    status: statusFilter === "all" ? undefined : statusFilter,
  });
  const { data: members = [] } = useMembers(currentWs?.id ?? "");
  const { data: sprints = [] } = useSprints(currentProject?.id ?? "");

  const memberByUser = useMemo(() => {
    const m = new Map<string, string>();
    for (const mb of members) if (mb.email) m.set(mb.user_id, mb.email);
    return m;
  }, [members]);

  const sprintById = useMemo(
    () => new Map(sprints.map((s) => [s.id, s.name])),
    [sprints],
  );

  const createMutation = useCreateTask(currentProject?.id ?? "");
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const [hiddenColumns, setHiddenColumns] = useHiddenColumns(
    currentProject?.id ?? "",
  );
  const toggleColumn = (key: ColKey) => {
    const next = new Set(hiddenColumns);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setHiddenColumns(next);
  };
  const show = (key: ColKey) => !hiddenColumns.has(key);

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
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
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
        <ColumnVisibilityMenu hidden={hiddenColumns} onToggle={toggleColumn} />
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "New task"}
        </Button>
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
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm table-fixed">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {show("id") && <th className="px-3 py-2 text-left w-24">ID</th>}
                {show("title") && <th className="px-3 py-2 text-left">Title</th>}
                {show("status") && (
                  <th className="px-3 py-2 text-left w-36">Status</th>
                )}
                {show("priority") && (
                  <th className="px-3 py-2 text-left w-28">Priority</th>
                )}
                {show("assignee") && (
                  <th className="px-3 py-2 text-left w-40">Assignee</th>
                )}
                {show("due") && (
                  <th className="px-3 py-2 text-left w-24">Due</th>
                )}
                {show("sprint") && (
                  <th className="px-3 py-2 text-left w-32">Sprint</th>
                )}
                {show("created") && (
                  <th className="px-3 py-2 text-left w-28">Created</th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedTasks.map((t) => {
                const assigneeEmail = t.assignee_id
                  ? memberByUser.get(t.assignee_id)
                  : undefined;
                const sprintName = t.sprint_id
                  ? sprintById.get(t.sprint_id)
                  : undefined;
                return (
                  <tr
                    key={t.id}
                    className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                    onClick={() =>
                      navigate(`/w/${wsSlug}/p/${pKey}/tasks/${t.identifier}`, {
                        state: {
                          from: { path: location.pathname, label: "List" },
                        },
                      })
                    }
                  >
                    {show("id") && (
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-500">
                        {t.identifier}
                      </td>
                    )}
                    {show("title") && (
                      <td className="px-3 py-2.5 text-slate-900 truncate">
                        {t.title}
                      </td>
                    )}
                    {show("status") && (
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLE[t.status]}`}
                        >
                          {STATUS_LABELS[t.status]}
                        </span>
                      </td>
                    )}
                    {show("priority") && (
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PRIORITY_STYLE[t.priority]}`}
                        >
                          {PRIORITY_LABELS[t.priority]}
                        </span>
                      </td>
                    )}
                    {show("assignee") && (
                      <td className="px-3 py-2.5">
                        {assigneeEmail ? (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Avatar email={assigneeEmail} />
                            <span className="text-xs text-slate-700 truncate">
                              {assigneeEmail}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    )}
                    {show("due") && (
                      <td className="px-3 py-2.5">
                        {t.due_date ? (
                          <DueDateCell date={t.due_date} />
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    )}
                    {show("sprint") && (
                      <td className="px-3 py-2.5">
                        {sprintName ? (
                          <span className="text-xs text-slate-700 truncate block">
                            {sprintName}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    )}
                    {show("created") && (
                      <td className="px-3 py-2.5 text-xs text-slate-500">
                        {new Date(t.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
