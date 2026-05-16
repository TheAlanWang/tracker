import { useState } from "react";
import { useParams } from "react-router-dom";

import { InlineTaskCreator } from "@/components/InlineTaskCreator";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { useTasks } from "@/features/tasks/api";
import { useProjects } from "@/features/projects/api";
import { useWorkspaces } from "@/features/workspaces/api";

export default function Backlog() {
  const { wsSlug, pKey } = useParams();

  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const { data: projects = [] } = useProjects(currentWs?.id ?? "");
  const currentProject = projects.find((p) => p.key === pKey);

  const { data: issues = [], isLoading } = useTasks(
    currentProject?.id ?? "",
    { status: "backlog" },
  );

  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  if (!currentProject) return null;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        New items live here until they're picked up. Set priority + dates, then
        move to Board to start work.
      </p>

      {isLoading && <p>Loading…</p>}
      {!isLoading && issues.length === 0 && (
        <p className="text-muted-foreground">Backlog is empty.</p>
      )}

      {issues.length > 0 && (
        <div className="overflow-hidden rounded border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium">ID</th>
                <th className="px-3 py-2 text-left font-medium">Title</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Priority</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((i) => (
                <tr
                  key={i.id}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                  onClick={() => setOpenTaskId(i.id)}
                >
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">
                    {i.identifier}
                  </td>
                  <td className="px-3 py-2">{i.title}</td>
                  <td className="px-3 py-2 text-xs">{i.status}</td>
                  <td className="px-3 py-2 text-xs">{i.priority}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded border border-slate-200 bg-white p-2">
        <InlineTaskCreator
          projectId={currentProject.id}
          status="backlog"
          triggerLabel="+ Add task to backlog"
          triggerClassName="w-full text-left text-sm text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded px-2 py-1.5 transition-colors"
        />
      </div>

      <TaskDetailModal
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
      />
    </div>
  );
}
