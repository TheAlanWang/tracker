import { useLocation, useNavigate } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type DashboardTask,
  type DashboardSprint,
  useDashboard,
} from "@/features/dashboard/api";

function TaskRow({
  issue,
  onClick,
}: {
  issue: DashboardTask;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="w-full text-left flex items-center gap-3 px-3 py-2 rounded hover:bg-slate-50 text-sm"
      onClick={onClick}
    >
      <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
        {issue.identifier}
      </span>
      <span className="flex-1 truncate">{issue.title}</span>
      <span className="text-xs text-muted-foreground shrink-0 capitalize">
        {issue.status.replace(/_/g, " ")}
      </span>
      {issue.due_date && (
        <span className="text-xs text-muted-foreground shrink-0">
          {issue.due_date}
        </span>
      )}
    </button>
  );
}

function SprintRow({
  sprint,
  onClick,
}: {
  sprint: DashboardSprint;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="w-full text-left flex items-center gap-3 px-3 py-2 rounded hover:bg-slate-50 text-sm"
      onClick={onClick}
    >
      <span className="flex-1 truncate font-medium">{sprint.name}</span>
      <span className="text-xs text-muted-foreground shrink-0">
        {sprint.workspace_slug} / {sprint.project_key}
      </span>
      {sprint.end_at && (
        <span className="text-xs text-muted-foreground shrink-0">
          ends {sprint.end_at.slice(0, 10)}
        </span>
      )}
    </button>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data, isLoading } = useDashboard();

  const dashboardOrigin = {
    state: { from: { path: location.pathname, label: "Dashboard" } },
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const assigned = data?.assigned_to_me ?? [];
  const dueThisWeek = data?.due_this_week ?? [];
  const activeSprints = data?.active_sprints ?? [];

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>

      {/* Assigned to me */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assigned to me</CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          {assigned.length === 0 ? (
            <p className="text-sm text-muted-foreground px-3 py-2">
              No tasks assigned to you
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {assigned.map((issue) => (
                <TaskRow
                  key={issue.id}
                  issue={issue}
                  onClick={() =>
                    navigate(
                      `/w/${issue.workspace_slug}/p/${issue.project_key}/tasks/${issue.identifier}`,
                      dashboardOrigin,
                    )
                  }
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Due this week */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Due this week</CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          {dueThisWeek.length === 0 ? (
            <p className="text-sm text-muted-foreground px-3 py-2">
              No tasks due this week
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {dueThisWeek.map((issue) => (
                <TaskRow
                  key={issue.id}
                  issue={issue}
                  onClick={() =>
                    navigate(
                      `/w/${issue.workspace_slug}/p/${issue.project_key}/tasks/${issue.identifier}`,
                      dashboardOrigin,
                    )
                  }
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active sprints */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active sprints</CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          {activeSprints.length === 0 ? (
            <p className="text-sm text-muted-foreground px-3 py-2">
              No active sprints
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {activeSprints.map((sprint) => (
                <SprintRow
                  key={sprint.id}
                  sprint={sprint}
                  onClick={() =>
                    navigate(
                      `/w/${sprint.workspace_slug}/p/${sprint.project_key}/sprints/${sprint.id}`,
                    )
                  }
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
