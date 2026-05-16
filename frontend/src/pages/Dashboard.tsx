import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { TaskDetailModal } from "@/components/TaskDetailModal";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type DashboardActivity,
  type DashboardSprint,
  type DashboardStats,
  type DashboardTask,
  useDashboard,
} from "@/features/dashboard/api";
import { useWorkspaces } from "@/features/workspaces/api";

const FIELD_LABEL: Record<string, string> = {
  title: "title",
  description: "description",
  status: "status",
  priority: "priority",
  assignee_id: "assignee",
  sprint_id: "sprint",
  due_date: "due date",
};

const STATUS_STYLE: Record<string, string> = {
  backlog: "bg-slate-100 text-slate-600",
  todo: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  in_review: "bg-purple-100 text-purple-700",
  done: "bg-green-100 text-green-700",
  cancelled: "bg-slate-100 text-slate-400",
};

function formatStatus(s: string): string {
  return s.replace(/_/g, " ");
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function Avatar({ email, size = 20 }: { email: string; size?: number }) {
  const initial = (email[0] ?? "?").toUpperCase();
  const hue =
    Array.from(email).reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div
      title={email}
      style={{
        width: size,
        height: size,
        backgroundColor: `hsl(${hue} 55% 50%)`,
      }}
      className="rounded-full flex items-center justify-center text-white text-[10px] font-semibold shrink-0"
    >
      {initial}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "neutral" | "good" | "warn" | "bad";
  icon: React.ReactNode;
}) {
  const toneClass = {
    neutral: "bg-slate-50 text-slate-600 border-slate-200",
    good: "bg-green-50 text-green-700 border-green-200",
    warn: "bg-amber-50 text-amber-700 border-amber-200",
    bad: "bg-red-50 text-red-700 border-red-200",
  }[tone];
  const iconClass = {
    neutral: "text-slate-400",
    good: "text-green-500",
    warn: "text-amber-500",
    bad: "text-red-500",
  }[tone];
  return (
    <div
      className={`flex-1 min-w-0 rounded-lg border bg-white p-4 flex items-center gap-4 transition-colors ${
        value > 0 && (tone === "bad" || tone === "warn") ? toneClass : ""
      }`}
    >
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
          tone === "bad" && value > 0
            ? "bg-red-100"
            : tone === "warn" && value > 0
              ? "bg-amber-100"
              : tone === "good"
                ? "bg-green-50"
                : "bg-slate-50"
        } ${iconClass}`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
          {label}
        </p>
        <p
          className={`text-2xl font-bold leading-tight ${
            tone === "bad" && value > 0
              ? "text-red-700"
              : tone === "warn" && value > 0
                ? "text-amber-700"
                : "text-slate-900"
          }`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function StatsBanner({ stats }: { stats: DashboardStats }) {
  return (
    <div className="flex flex-wrap gap-3">
      <StatCard
        label="Open"
        value={stats.open}
        tone="neutral"
        icon={
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path
              fillRule="evenodd"
              d="M2.5 4A1.5 1.5 0 0 1 4 2.5h12A1.5 1.5 0 0 1 17.5 4v12a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 16V4Zm1.5 0v12h12V4H4Z"
              clipRule="evenodd"
            />
          </svg>
        }
      />
      <StatCard
        label="In review"
        value={stats.in_review}
        tone="neutral"
        icon={
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path
              fillRule="evenodd"
              d="M8 3a5 5 0 1 0 3.65 8.41l3.47 3.47a.75.75 0 1 0 1.06-1.06l-3.47-3.47A5 5 0 0 0 8 3ZM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0Z"
              clipRule="evenodd"
            />
          </svg>
        }
      />
      <StatCard
        label="Done this week"
        value={stats.done_this_week}
        tone="good"
        icon={
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path
              fillRule="evenodd"
              d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.59l7.3-7.3a1 1 0 0 1 1.4 0Z"
              clipRule="evenodd"
            />
          </svg>
        }
      />
      <StatCard
        label="Overdue"
        value={stats.overdue}
        tone="bad"
        icon={
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-11.25v4.5a.75.75 0 0 1-1.5 0v-4.5a.75.75 0 0 1 1.5 0ZM10 14a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"
              clipRule="evenodd"
            />
          </svg>
        }
      />
    </div>
  );
}

function TaskRow({
  task,
  onClick,
  highlight = false,
}: {
  task: DashboardTask;
  onClick: () => void;
  highlight?: boolean;
}) {
  const dueLabel = task.due_date
    ? new Date(task.due_date).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;
  const isOverdue =
    !!task.due_date &&
    new Date(task.due_date).getTime() < new Date().setHours(0, 0, 0, 0);
  return (
    <button
      type="button"
      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded hover:bg-slate-50 text-sm transition-colors ${
        highlight ? "hover:bg-red-50/50" : ""
      }`}
      onClick={onClick}
    >
      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
        {task.identifier}
      </span>
      <span className="flex-1 truncate text-slate-800">{task.title}</span>
      {dueLabel && (
        <span
          className={`text-xs shrink-0 ${
            isOverdue ? "text-red-600 font-medium" : "text-slate-500"
          }`}
        >
          {dueLabel}
        </span>
      )}
      <span
        className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide shrink-0 ${
          STATUS_STYLE[task.status] ?? "bg-slate-100 text-slate-600"
        }`}
      >
        {formatStatus(task.status)}
      </span>
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
      className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded hover:bg-slate-50 text-sm"
      onClick={onClick}
    >
      <span className="flex-1 truncate font-medium text-slate-800">
        {sprint.name}
      </span>
      <span className="text-xs text-slate-400 shrink-0">
        {sprint.workspace_slug} / {sprint.project_key}
      </span>
      {sprint.end_at && (
        <span className="text-xs text-slate-500 shrink-0">
          ends{" "}
          {new Date(sprint.end_at).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </span>
      )}
    </button>
  );
}

function formatActivityAction(a: DashboardActivity): React.ReactNode {
  const p = a.payload as Record<
    string,
    { from?: unknown; to?: unknown; updated?: boolean }
  >;
  switch (a.action) {
    case "created":
      return <>created</>;
    case "commented":
      return <>commented on</>;
    case "updated": {
      const fields = Object.keys(p);
      if (fields.length === 0) return <>edited</>;
      if (fields.length === 1) {
        const f = fields[0];
        const label = FIELD_LABEL[f] ?? f;
        const c = p[f];
        if (c.updated) return <>updated {label} of</>;
        return (
          <>
            changed {label} of {""}
          </>
        );
      }
      return <>updated {fields.map((f) => FIELD_LABEL[f] ?? f).join(", ")} of</>;
    }
    default:
      return <>{a.action.replace(/_/g, " ")}</>;
  }
}

function ActivityRow({
  a,
  onClick,
}: {
  a: DashboardActivity;
  onClick: () => void;
}) {
  const actor = a.actor_email ?? "Someone";
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-start gap-2.5 px-3 py-2 rounded hover:bg-slate-50 text-xs"
    >
      <Avatar email={actor} size={20} />
      <div className="flex-1 min-w-0 leading-relaxed">
        <span className="text-slate-700">
          <span className="font-medium text-slate-900">{actor}</span>{" "}
          {formatActivityAction(a)}{" "}
          <span className="font-mono text-[11px] px-1 py-0.5 rounded bg-slate-100 text-slate-600">
            {a.task_identifier}
          </span>{" "}
          <span className="text-slate-600">{a.task_title}</span>
        </span>
      </div>
      <span className="text-slate-400 shrink-0">{formatRelative(a.created_at)}</span>
    </button>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { wsSlug } = useParams();
  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const { data, isLoading } = useDashboard(currentWs?.id);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const stats = data?.stats ?? {
    open: 0,
    done_this_week: 0,
    overdue: 0,
    in_review: 0,
  };
  const assigned = data?.assigned_to_me ?? [];
  const dueThisWeek = data?.due_this_week ?? [];
  const overdue = data?.overdue ?? [];
  const activeSprints = data?.active_sprints ?? [];
  const recentActivity = data?.recent_activity ?? [];

  const goToTask = (t: DashboardTask) => setOpenTaskId(t.id);

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">
          {currentWs
            ? `Your work in ${currentWs.name} at a glance.`
            : "Your work at a glance."}
        </p>
      </div>

      {/* KPI banner */}
      <StatsBanner stats={stats} />

      {/* Overdue alert */}
      {overdue.length > 0 && (
        <Card className="border-red-200 bg-red-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-red-700">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-11.25v4.5a.75.75 0 0 1-1.5 0v-4.5a.75.75 0 0 1 1.5 0ZM10 14a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Overdue ({overdue.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <div className="divide-y divide-red-100">
              {overdue.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onClick={() => goToTask(t)}
                  highlight
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Two columns: tasks + activity */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-6 min-w-0">
          {/* Assigned to me */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Assigned to me</CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              {assigned.length === 0 ? (
                <p className="text-sm text-muted-foreground px-3 py-2">
                  No open tasks assigned to you.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {assigned.map((t) => (
                    <TaskRow key={t.id} task={t} onClick={() => goToTask(t)} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Due this week */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Due this week</CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              {dueThisWeek.length === 0 ? (
                <p className="text-sm text-muted-foreground px-3 py-2">
                  Nothing due in the next 7 days.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {dueThisWeek.map((t) => (
                    <TaskRow key={t.id} task={t} onClick={() => goToTask(t)} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active sprints */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Active sprints</CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              {activeSprints.length === 0 ? (
                <p className="text-sm text-muted-foreground px-3 py-2">
                  No sprints running right now.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {activeSprints.map((s) => (
                    <SprintRow
                      key={s.id}
                      sprint={s}
                      onClick={() =>
                        navigate(
                          `/w/${s.workspace_slug}/p/${s.project_key}/sprints/${s.id}`,
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: activity feed */}
        <div className="space-y-6 min-w-0">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recent activity</CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              {recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground px-3 py-2">
                  No activity yet.
                </p>
              ) : (
                <div className="space-y-0.5">
                  {recentActivity.map((a) => (
                    <ActivityRow
                      key={a.id}
                      a={a}
                      onClick={() => setOpenTaskId(a.task_id)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <TaskDetailModal
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
      />
    </div>
  );
}
