import { useState } from "react";
import { useParams } from "react-router-dom";

import { TaskDetailModal } from "@/components/TaskDetailModal";
import { PRIORITY_LABELS, STATUS_LABELS } from "@/features/tasks/labels";
import { type TaskPriority, type TaskStatus, useWorkspaceTasks } from "@/features/tasks/api";
import { useWorkspaces } from "@/features/workspaces/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export default function MyIssues() {
  const { wsSlug } = useParams();
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const { data: me } = useCurrentUser();
  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const wsId = currentWs?.id ?? "";

  const { data: issues = [], isLoading } = useWorkspaceTasks(wsId, {
    assigneeId: me?.id,
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold text-slate-900">My Tasks</h1>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      {!isLoading && issues.length === 0 && (
        <p className="text-muted-foreground">
          No tasks assigned to you in this workspace.
        </p>
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
                <th className="px-3 py-2 text-left font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => {
                return (
                  <tr
                    key={issue.id}
                    className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                    onClick={() => setOpenTaskId(issue.id)}
                  >
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">
                      {issue.identifier}
                    </td>
                    <td className="px-3 py-2">{issue.title}</td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">
                        {STATUS_LABELS[issue.status as TaskStatus] ?? issue.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {PRIORITY_LABELS[issue.priority as TaskPriority] ?? issue.priority}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(issue.updated_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <TaskDetailModal
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
      />
    </div>
  );
}
