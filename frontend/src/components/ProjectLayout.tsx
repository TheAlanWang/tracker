import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateTask } from "@/features/tasks/api";
import { useProjects } from "@/features/projects/api";
import { useWorkspaces } from "@/features/workspaces/api";

const TABS = [
  { to: "board", label: "Board" },
  { to: "list", label: "List" },
  { to: "backlog", label: "Backlog" },
  { to: "sprints", label: "Sprints" },
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
      ? "border-b-2 border-slate-900 px-3 py-2 text-sm font-medium text-slate-900"
      : "border-b-2 border-transparent px-3 py-2 text-sm text-slate-500 hover:text-slate-900";

  return (
    <div className="space-y-0">
      <div className="border-b border-slate-200 -mt-8 -mx-8 px-8 pt-5 pb-0 bg-white">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-900">
            {currentProject.name}
          </h1>
          <Button
            type="button"
            onClick={() => {
              setTaskTitle("");
              setTaskDesc("");
              setNewTaskOpen(true);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            + New task
          </Button>
        </div>
        <nav className="mt-3 flex items-center gap-1">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={`/w/${wsSlug}/p/${pKey}/${t.to}`}
              className={tabClass}
              end={false}
            >
              {t.label}
            </NavLink>
          ))}
          <div className="ml-auto">
            <NavLink
              to={`/w/${wsSlug}/p/${pKey}/settings`}
              className={tabClass}
              title="Project settings"
              end={false}
            >
              ⚙
            </NavLink>
          </div>
        </nav>
      </div>
      <div className="pt-6">
        <Outlet />
      </div>

      {newTaskOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => setNewTaskOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-lg bg-white shadow-xl p-5 space-y-4"
          >
            <h2 className="text-lg font-semibold text-slate-900">
              New task in {currentProject.name}
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
                  className="w-full rounded border border-slate-300 bg-white p-2 text-sm"
                  rows={3}
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  maxLength={10000}
                />
              </div>
              <p className="text-xs text-slate-500">
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
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {createTaskMutation.isPending ? "Creating…" : "Create task"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
