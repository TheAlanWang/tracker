import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { ExportTasksButton } from "@/components/ExportTasksButton";
import { FilterBar } from "@/components/FilterBar";
import { useMembers } from "@/features/members/api";
import { projectDotColor } from "@/lib/projectColor";
import { SortableHeader } from "@/components/SortableHeader";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { useProjects } from "@/features/projects/api";
import { useMyWatchedTasks } from "@/features/watchers/api";
import { PriorityPill, StatusPill } from "@/components/StatusPill";
import { TaskTableCard, TaskTableHead } from "@/components/TaskTableCard";
import {
  type Task,
  type TaskPriority,
  type TaskStatus,
  useWorkspaceTasks,
} from "@/features/tasks/api";
import {
  applyFilters,
  applySort,
  loadFilters,
  loadSort,
  saveFilters,
  saveSort,
  type Filter,
  type SortField,
  type SortState,
} from "@/features/tasks/filters";
import { useWorkspaces } from "@/features/workspaces/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { EmptyState } from "@/components/EmptyState";

type ColKey =
  | "id"
  | "project"
  | "title"
  | "status"
  | "priority"
  | "due"
  | "updated";

const COLUMNS: { key: ColKey; label: string }[] = [
  { key: "id", label: "Task ID" },
  { key: "project", label: "Project" },
  { key: "title", label: "Title" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "due", label: "Due" },
  { key: "updated", label: "Updated" },
];

const COL_SORT_FIELD: Partial<Record<ColKey, SortField>> = {
  id: "identifier",
  title: "title",
  status: "status",
  priority: "priority",
  due: "due_date",
  updated: "updated_at",
};

// Hidden by default — the user can toggle them on via the Columns
// menu, but they're not load-bearing for the typical "what should I be
// working on" scan that My Tasks supports. Keeps the initial render
// tight on common screen widths.
const DEFAULT_HIDDEN: ColKey[] = ["updated"];

function useHiddenColumns(scopeKey: string) {
  const key = scopeKey ? `tracker.mytasks.hidden.${scopeKey}` : "";
  const [hidden, setHidden] = useState<Set<ColKey>>(() => {
    if (!key) return new Set(DEFAULT_HIDDEN);
    try {
      const raw = localStorage.getItem(key);
      return raw
        ? new Set(JSON.parse(raw) as ColKey[])
        : new Set(DEFAULT_HIDDEN);
    } catch {
      return new Set(DEFAULT_HIDDEN);
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
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
    >
      <rect x="3" y="4.5" width="18" height="15" rx="1.5" />
      <path d="M9 4.5v15M15 4.5v15" />
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
        className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md px-2.5 py-1 transition-colors"
      >
        <ColumnsIcon />
        <span>Columns</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800 shadow-lg z-30 py-1">
          {COLUMNS.map((c) => (
            <label
              key={c.key}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={!hidden.has(c.key)}
                onChange={() => onToggle(c.key)}
                className="rounded border-slate-300 dark:border-slate-700"
              />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      )}
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
      : "text-slate-600 dark:text-slate-400";
  return (
    <span className={`text-xs ${cls}`}>
      {due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
    </span>
  );
}

export default function MyIssues() {
  useDocumentTitle("My Tasks");
  const { wsSlug } = useParams();
  return <MyIssuesContent key={wsSlug ?? ""} />;
}

type View = "assigned" | "watching";

function MyIssuesContent() {
  const { wsSlug } = useParams();
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  // View toggle: "assigned" = tasks where I'm the current assignee, "watching"
  // = tasks I've subscribed to (auto-includes anything I created or have
  // ever been assigned to). Scoped to the current workspace.
  const [view, setView] = useState<View>("assigned");

  const { data: me } = useCurrentUser();
  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const wsId = currentWs?.id ?? "";
  // For the CSV export's Assignee column resolver — every task here is
  // assigned to the current user, but the lookup pattern is shared with
  // other list pages so we keep the same shape.
  const { data: members = [] } = useMembers(wsId);

  const { data: assignedTasks = [], isLoading: assignedLoading } =
    useWorkspaceTasks(wsId, { assigneeId: me?.id });
  const { data: watchedAll = [], isLoading: watchedLoading } =
    useMyWatchedTasks();
  const watchedInWs = useMemo(
    () => watchedAll.filter((t) => t.workspace_id === wsId),
    [watchedAll, wsId],
  );

  // Both shapes have every field the table + filters need (id, identifier,
  // title, project_id, status, priority, due_date, created_at, updated_at).
  // Cast through unknown — WatchedTask intentionally omits Task internals
  // (description, sprint_id, etc.) we don't render here.
  const issues = (view === "assigned"
    ? assignedTasks
    : watchedInWs) as unknown as Task[];
  const isLoading = view === "assigned" ? assignedLoading : watchedLoading;

  const { data: projects = [] } = useProjects(wsId);
  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );

  const filterKey = wsId ? `tracker.mytasks.filters.${wsId}` : "";
  const sortKey = wsId ? `tracker.mytasks.sort.${wsId}` : "";
  const [filters, setFilters] = useState<Filter[]>(() =>
    filterKey ? loadFilters(filterKey) : [],
  );
  const [sort, setSort] = useState<SortState>(() =>
    sortKey ? loadSort(sortKey) : null,
  );
  useEffect(() => {
    if (filterKey) saveFilters(filterKey, filters);
  }, [filterKey, filters]);
  useEffect(() => {
    if (sortKey) saveSort(sortKey, sort);
  }, [sortKey, sort]);

  const [hiddenColumns, setHiddenColumns] = useHiddenColumns(wsId);
  const toggleColumn = (key: ColKey) => {
    const next = new Set(hiddenColumns);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setHiddenColumns(next);
  };
  const show = (key: ColKey) => !hiddenColumns.has(key);

  const displayedTasks = useMemo(() => {
    const filtered = applyFilters(issues, filters);
    if (sort) return applySort(filtered, sort);
    // Default: most recently updated first.
    return [...filtered].sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
  }, [issues, filters, sort]);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            My Tasks
          </h1>
          {/* Row count — gives the page a quick "how much am I looking
              at" anchor that updates with every filter / sort change. */}
          <span className="text-sm text-slate-400 dark:text-slate-500 tabular-nums">
            {displayedTasks.length} task{displayedTasks.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle — assigned (default) vs everything I'm watching.
              Active button gets a clearer contrast (shadow + bg-white on a
              slate-100 track) so it doesn't blend with the inactive one. */}
          <div className="inline-flex rounded-md bg-slate-100 dark:bg-slate-800 p-0.5 text-sm">
            <button
              type="button"
              onClick={() => setView("assigned")}
              className={`px-3 py-1 rounded transition-colors ${
                view === "assigned"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-medium shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
            >
              Assigned to me
            </button>
            <button
              type="button"
              onClick={() => setView("watching")}
              className={`px-3 py-1 rounded transition-colors ${
                view === "watching"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-medium shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
            >
              Watching
            </button>
          </div>
          <ExportTasksButton
            tasks={displayedTasks}
            members={members}
            filename="My tasks"
          />
        </div>
      </div>

      <FilterBar
        filters={filters}
        onFiltersChange={setFilters}
        // Filter order mirrors the visible columns left-to-right (id and
        // title aren't filterable, so they're skipped). Keeps the
        // "where to filter what" mental map consistent with the table.
        availableFilterFields={["project", "status", "priority", "due"]}
        projectOptions={projects.map((p) => ({ id: p.id, name: p.name }))}
        trailing={
          <ColumnVisibilityMenu
            hidden={hiddenColumns}
            onToggle={toggleColumn}
          />
        }
      />

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      {!isLoading && issues.length === 0 && (
        <EmptyState
          title="All caught up"
          description="Nothing is assigned to you in this workspace. When teammates assign you tasks, they'll show up here."
          icon={
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-6 h-6"
            >
              <path d="M9 11l3 3 8-8" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          }
        />
      )}

      {issues.length > 0 && (
        // Title column capped at ~40% so a short title doesn't strand
        // metadata in white space. Outer card / thead chrome lives in
        // TaskTableCard so every list page in the app stays in sync.
        <TaskTableCard>
              <TaskTableHead>
                <tr className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {COLUMNS.map((c) => {
                    if (!show(c.key)) return null;
                    const sortField = COL_SORT_FIELD[c.key];
                    // Title gets a relative width (~40%) so it scales with
                    // the table but never takes the entire remainder when
                    // task titles are short. Everything else stays pixel.
                    const widthCls =
                      c.key === "id"
                        ? "w-24"
                        : c.key === "project"
                          ? "w-40"
                          : c.key === "title"
                            ? "w-2/5"
                            : c.key === "status"
                              ? "w-32"
                              : c.key === "priority"
                                ? "w-28"
                                : c.key === "due"
                                  ? "w-24"
                                  : c.key === "updated"
                                    ? "w-24"
                                    : "";
                    return (
                      <th
                        key={c.key}
                        className={`px-3 py-2.5 text-left whitespace-nowrap font-medium ${widthCls}`}
                      >
                        {sortField ? (
                          <SortableHeader
                            field={sortField}
                            label={c.label}
                            sort={sort}
                            onSortChange={setSort}
                          />
                        ) : (
                          c.label
                        )}
                      </th>
                    );
                  })}
                </tr>
              </TaskTableHead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {displayedTasks.length === 0 && (
                  <tr>
                    <td
                      colSpan={COLUMNS.filter((c) => show(c.key)).length}
                      className="px-3 py-10 text-center text-sm text-slate-400 dark:text-slate-500"
                    >
                      No tasks match the current filters.
                    </td>
                  </tr>
                )}
                {displayedTasks.map((issue) => {
                  const project = projectById.get(issue.project_id);
                  return (
                    <tr
                      key={issue.id}
                      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                      onClick={() => setOpenTaskId(issue.id)}
                    >
                      {show("id") && (
                        <td className="px-3 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                          {issue.identifier}
                        </td>
                      )}
                      {show("project") && (
                        <td className="px-3 py-2.5">
                          {project ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{
                                  backgroundColor: projectDotColor({
                                    key: project.key,
                                    color: project.color,
                                  }),
                                }}
                              />
                              <span className="truncate">{project.name}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                          )}
                        </td>
                      )}
                      {show("title") && (
                        <td className="px-3 py-2.5" title={issue.title}>
                          <div className="truncate text-slate-800 dark:text-slate-200">
                            {issue.title}
                          </div>
                        </td>
                      )}
                      {show("status") && (
                        <td className="px-3 py-2.5">
                          <StatusPill status={issue.status as TaskStatus} />
                        </td>
                      )}
                      {show("priority") && (
                        <td className="px-3 py-2.5">
                          <PriorityPill priority={issue.priority as TaskPriority} hideNoPriority />
                        </td>
                      )}
                      {show("due") && (
                        <td className="px-3 py-2.5">
                          {issue.due_date ? (
                            <DueDateCell date={issue.due_date} />
                          ) : (
                            <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                          )}
                        </td>
                      )}
                      {show("updated") && (
                        <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                          {new Date(issue.updated_at).toLocaleDateString(
                            undefined,
                            { month: "short", day: "numeric" },
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
            </tbody>
        </TaskTableCard>
      )}
      <TaskDetailModal
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
      />
    </div>
  );
}
