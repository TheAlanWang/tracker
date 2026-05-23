import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { InlineSpinner } from "@/components/PageSpinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VelocityChart } from "@/components/VelocityChart";
import { useProjects } from "@/features/projects/api";
import {
  Sprint,
  SprintStatus,
  useCreateSprint,
  useSprints,
} from "@/features/sprints/api";
import { useTasks, type Task } from "@/features/tasks/api";
import { useWorkspaces } from "@/features/workspaces/api";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

function fmtShort(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

type SprintStats = {
  total: number;
  done: number;
  inProgress: number;
  notStarted: number;
};

function statsFor(tasks: Task[]): SprintStats {
  const total = tasks.length;
  let done = 0;
  let inProgress = 0;
  for (const t of tasks) {
    if (t.status === "done") done++;
    else if (t.status === "in_progress" || t.status === "in_review") inProgress++;
  }
  return { total, done, inProgress, notStarted: total - done - inProgress };
}

function dateRangeText(s: Sprint): string {
  if (!s.start_at && !s.end_at) return "No dates set";
  return `${fmtShort(s.start_at)} — ${fmtShort(s.end_at)}`;
}

function durationText(s: Sprint): string | null {
  const dur = daysBetween(s.start_at, s.end_at);
  if (dur === null) return null;
  return `${dur} day${dur === 1 ? "" : "s"}`;
}

// ---- Subcomponents ----

function StatusDot({ status }: { status: SprintStatus }) {
  const cls =
    status === "active"
      ? "bg-emerald-500 ring-emerald-500/30"
      : status === "planned"
        ? "bg-amber-500 ring-amber-500/30"
        : "bg-slate-400 ring-slate-400/20";
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full ring-4 ${cls}`}
    />
  );
}

function CountdownPill({ sprint }: { sprint: Sprint }) {
  if (sprint.status === "active" && sprint.end_at) {
    const d = daysUntil(sprint.end_at);
    if (d === null) return null;
    if (d > 0)
      return (
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
          {d} day{d === 1 ? "" : "s"} left
        </span>
      );
    if (d === 0)
      return (
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
          Ends today
        </span>
      );
    return (
      <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
        {Math.abs(d)}d overdue
      </span>
    );
  }
  if (sprint.status === "planned" && sprint.start_at) {
    const d = daysUntil(sprint.start_at);
    if (d === null) return null;
    if (d > 0)
      return (
        <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
          Starts in {d} day{d === 1 ? "" : "s"}
        </span>
      );
    if (d === 0)
      return (
        <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
          Starts today
        </span>
      );
  }
  return null;
}

function ProgressBar({
  stats,
  height = "h-2",
}: {
  stats: SprintStats;
  height?: string;
}) {
  const donePct =
    stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
  const inProgressPct =
    stats.total > 0
      ? Math.round((stats.inProgress / stats.total) * 100)
      : 0;
  return (
    <div
      className={`${height} w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex`}
    >
      <div
        className="bg-emerald-500 h-full transition-all"
        style={{ width: `${donePct}%` }}
      />
      <div
        className="bg-emerald-200 h-full transition-all"
        style={{ width: `${inProgressPct}%` }}
      />
    </div>
  );
}

function ActiveSprintCard({
  sprint,
  stats,
  onClick,
}: {
  sprint: Sprint;
  stats: SprintStats;
  onClick: () => void;
}) {
  const donePct =
    stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
  const dur = durationText(sprint);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group block w-full text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-slate-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-center gap-2 mb-3">
        <StatusDot status="active" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
          Active
        </span>
        <CountdownPill sprint={sprint} />
      </div>

      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {sprint.name}
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {dateRangeText(sprint)}
            {dur ? <span className="text-slate-400 dark:text-slate-500"> · {dur}</span> : null}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums leading-none">
            {donePct}
            <span className="text-base font-medium text-slate-400 dark:text-slate-500">%</span>
          </div>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Complete
          </p>
        </div>
      </div>

      <ProgressBar stats={stats} height="h-2" />

      <div className="mt-4 flex items-center gap-6 text-xs">
        <Stat label="Total" value={stats.total} />
        <Stat label="In progress" value={stats.inProgress} accent="amber" />
        <Stat label="Done" value={stats.done} accent="emerald" />
        <span className="ml-auto text-slate-400 dark:text-slate-500 group-hover:text-slate-600 transition-colors">
          View sprint →
        </span>
      </div>
    </button>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "amber" | "emerald";
}) {
  const valueCls =
    accent === "amber"
      ? "text-amber-700"
      : accent === "emerald"
        ? "text-emerald-700"
        : "text-slate-900 dark:text-slate-100";
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`text-sm font-semibold tabular-nums ${valueCls}`}>
        {value}
      </span>
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
    </div>
  );
}

function PlannedSprintCard({
  sprint,
  stats,
  onClick,
}: {
  sprint: Sprint;
  stats: SprintStats;
  onClick: () => void;
}) {
  const dur = durationText(sprint);
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-slate-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-center gap-2 mb-2">
        <StatusDot status="planned" />
        <CountdownPill sprint={sprint} />
      </div>
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
        {sprint.name}
      </h3>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        {dateRangeText(sprint)}
        {dur ? <span className="text-slate-400 dark:text-slate-500"> · {dur}</span> : null}
      </p>
      <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        {stats.total === 0 ? (
          <span className="text-slate-400 dark:text-slate-500">No tasks yet</span>
        ) : (
          <span>
            <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
              {stats.total}
            </span>{" "}
            task{stats.total === 1 ? "" : "s"} queued
          </span>
        )}
      </div>
    </button>
  );
}

function CompletedSprintRow({
  sprint,
  stats,
  onClick,
}: {
  sprint: Sprint;
  stats: SprintStats;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center w-full text-left gap-4 rounded-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-slate-200 transition-colors"
    >
      <StatusDot status="completed" />
      <span className="font-medium text-slate-700 dark:text-slate-300 truncate">{sprint.name}</span>
      <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
        {dateRangeText(sprint)}
      </span>
      <span className="ml-auto text-xs text-slate-500 dark:text-slate-400 tabular-nums">
        {stats.done}/{stats.total} done
      </span>
    </button>
  );
}

// ---- New sprint modal ----

function NewSprintModal({
  onClose,
  projectId,
}: {
  onClose: () => void;
  projectId: string;
}) {
  const createMutation = useCreateSprint(projectId);
  const [name, setName] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (startAt && endAt && new Date(endAt) < new Date(startAt)) {
      toast.error("End date must be after start date");
      return;
    }
    try {
      const s = await createMutation.mutateAsync({
        name,
        start_at: startAt || null,
        end_at: endAt || null,
      });
      toast.success(`Created ${s.name}`);
      onClose();
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to create sprint";
      toast.error(detail);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg bg-white dark:bg-slate-900 shadow-xl p-5 space-y-4"
      >
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">New Sprint</h2>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="sprint-name">Name</Label>
            <Input
              id="sprint-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={1}
              maxLength={100}
              placeholder="Sprint 1"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="sprint-start">Start date</Label>
              <input
                id="sprint-start"
                type="date"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sprint-end">End date</Label>
              <input
                id="sprint-end"
                type="date"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Dates are optional. The sprint starts as{" "}
            <span className="font-medium">Planned</span> — activate it from its
            detail page when ready.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || !name.trim()}
            >
              {createMutation.isPending ? "Creating…" : "Create sprint"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- Page ----

export default function SprintList() {
  useDocumentTitle("Sprints");
  const { wsSlug, pKey } = useParams();
  const navigate = useNavigate();

  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const { data: projects = [] } = useProjects(currentWs?.id ?? "");
  const currentProject = projects.find((p) => p.key === pKey);

  const projectId = currentProject?.id ?? "";
  const { data: sprints = [], isLoading } = useSprints(projectId);
  const { data: tasks = [] } = useTasks(projectId);

  const [newOpen, setNewOpen] = useState(false);
  const [showAllCompleted, setShowAllCompleted] = useState(false);

  const tasksBySprint = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.sprint_id) continue;
      const arr = m.get(t.sprint_id);
      if (arr) arr.push(t);
      else m.set(t.sprint_id, [t]);
    }
    return m;
  }, [tasks]);

  const statsBySprint = useMemo(() => {
    const m = new Map<string, SprintStats>();
    for (const s of sprints) {
      m.set(s.id, statsFor(tasksBySprint.get(s.id) ?? []));
    }
    return m;
  }, [sprints, tasksBySprint]);

  const goToSprint = (id: string) =>
    navigate(`/w/${wsSlug}/p/${pKey}/sprints/${id}`);

  if (!currentProject) return null;

  const active = sprints.filter((s) => s.status === "active");
  const planned = sprints
    .filter((s) => s.status === "planned")
    .sort((a, b) => {
      // Soonest start first; sprints without a start date go to the end.
      if (!a.start_at) return 1;
      if (!b.start_at) return -1;
      return new Date(a.start_at).getTime() - new Date(b.start_at).getTime();
    });
  const completed = sprints
    .filter((s) => s.status === "completed")
    .sort((a, b) => {
      // Most recently ended first.
      const aT = a.end_at ?? a.updated_at;
      const bT = b.end_at ?? b.updated_at;
      return new Date(bT).getTime() - new Date(aT).getTime();
    });

  const COMPLETED_PREVIEW = 3;
  const visibleCompleted = showAllCompleted
    ? completed
    : completed.slice(0, COMPLETED_PREVIEW);

  return (
    <div className="space-y-8">
      {/* Active section: header + "+ New sprint" share a single row. */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
              Active
            </h2>
            <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
              {active.length}
            </span>
          </div>
          <Button
            size="sm"
            className="rounded-full"
            onClick={() => setNewOpen(true)}
          >
            + New Sprint
          </Button>
        </div>

        {isLoading && <InlineSpinner />}

        {!isLoading && active.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 p-6 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No active sprint. Start one from a planned sprint's detail page.
            </p>
          </div>
        )}

        {active.map((s) => (
          <ActiveSprintCard
            key={s.id}
            sprint={s}
            stats={statsBySprint.get(s.id) ?? statsFor([])}
            onClick={() => goToSprint(s.id)}
          />
        ))}
      </section>

      {planned.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
              Planned
            </h2>
            <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
              {planned.length}
            </span>
          </div>
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {planned.map((s) => (
              <PlannedSprintCard
                key={s.id}
                sprint={s}
                stats={statsBySprint.get(s.id) ?? statsFor([])}
                onClick={() => goToSprint(s.id)}
              />
            ))}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
            Velocity
          </h2>
          <VelocityChart projectId={projectId} />
        </section>
      )}

      {completed.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
              Completed
            </h2>
            <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
              {completed.length}
            </span>
          </div>
          <div className="space-y-1.5">
            {visibleCompleted.map((s) => (
              <CompletedSprintRow
                key={s.id}
                sprint={s}
                stats={statsBySprint.get(s.id) ?? statsFor([])}
                onClick={() => goToSprint(s.id)}
              />
            ))}
          </div>
          {completed.length > COMPLETED_PREVIEW && (
            <button
              type="button"
              onClick={() => setShowAllCompleted((v) => !v)}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
            >
              {showAllCompleted
                ? "Show fewer"
                : `Show ${completed.length - COMPLETED_PREVIEW} more`}
            </button>
          )}
        </section>
      )}

      {newOpen && (
        <NewSprintModal
          onClose={() => setNewOpen(false)}
          projectId={projectId}
        />
      )}
    </div>
  );
}
