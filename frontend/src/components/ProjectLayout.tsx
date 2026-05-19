import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { Inbox, Kanban, List as ListIcon, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateTask } from "@/features/tasks/api";
import { useProjects } from "@/features/projects/api";
import { useWorkspaces } from "@/features/workspaces/api";

const TABS = [
  { to: "board", label: "Board", Icon: Kanban },
  { to: "list", label: "List", Icon: ListIcon },
  { to: "backlog", label: "Backlog", Icon: Inbox },
  { to: "sprints", label: "Sprints", Icon: Zap },
] as const;

export function ProjectLayout() {
  const { wsSlug, pKey } = useParams();
  const navigate = useNavigate();

  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const { data: projects = [], isLoading } = useProjects(currentWs?.id ?? "");
  const currentProject = projects.find((p) => p.key === pKey);

  const createTaskMutation = useCreateTask(currentProject?.id ?? "");
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");

  useEffect(() => {
    if (!isLoading && currentWs && !currentProject) {
      navigate(`/w/${wsSlug}`, { replace: true });
    }
  }, [isLoading, currentWs, currentProject, navigate, wsSlug]);

  useEffect(() => {
    if (!newTaskOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setNewTaskOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newTaskOpen]);

  if (!currentProject) return null;

  async function onCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    try {
      const t = await createTaskMutation.mutateAsync({
        title: taskTitle.trim(),
        description: taskDesc.trim() || undefined,
      });
      toast.success(`Created ${t.identifier}`);
      setNewTaskOpen(false);
      setTaskTitle("");
      setTaskDesc("");
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to create task";
      toast.error(detail);
    }
  }

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? "inline-flex items-center gap-1.5 h-9 border-b-2 border-slate-900 dark:border-slate-100 px-3 text-sm font-medium text-slate-900 dark:text-slate-100"
      : "inline-flex items-center gap-1.5 h-9 border-b-2 border-transparent px-3 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100";

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {/* Workspace eyebrow — sits above the project title in a
              lighter shade so users always know which workspace this
              project lives in (helpful when the same project name
              exists across workspaces). */}
          {currentWs && (
            <p className="text-xs font-medium text-slate-400 dark:text-slate-500 mb-0.5">
              {currentWs.name}
            </p>
          )}
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
            {currentProject.name}
          </h1>
          {currentProject.description && (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
              {currentProject.description}
            </p>
          )}
        </div>
        <Button
          type="button"
          className="shrink-0"
          onClick={() => {
            setTaskTitle("");
            setTaskDesc("");
            setNewTaskOpen(true);
          }}
        >
          + New Task
        </Button>
      </div>
      <nav className="mt-2 flex items-center gap-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={`/w/${wsSlug}/p/${pKey}/${t.to}`}
            className={tabClass}
            end={false}
          >
            <t.Icon className="w-4 h-4" strokeWidth={1.7} />
            {t.label}
          </NavLink>
        ))}
      </nav>
      <div className="pt-2">
        <Outlet />
      </div>

      {newTaskOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => setNewTaskOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-lg bg-white dark:bg-slate-900 shadow-xl p-5 space-y-4"
          >
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>New Task in</span>
              <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5">
                {currentProject.name}
              </span>
            </h2>
            <form onSubmit={onCreateTask} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="new-task-title">Title</Label>
                <Input
                  id="new-task-title"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  required
                  minLength={1}
                  maxLength={200}
                  placeholder="What needs doing?"
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-task-desc">Description (optional)</Label>
                <textarea
                  id="new-task-desc"
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-sm"
                  rows={3}
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  maxLength={10000}
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                The task lands in <span className="font-medium">Backlog</span> with no
                priority. Set a priority and drag it to the board when ready.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setNewTaskOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createTaskMutation.isPending || !taskTitle.trim()}
                      >
                  {createTaskMutation.isPending ? "Creating…" : "Create Task"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
