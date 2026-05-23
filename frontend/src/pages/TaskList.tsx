import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { Avatar } from "@/components/Avatar";
import { parseDueDate } from "@/lib/date";
import { ExportTasksButton } from "@/components/ExportTasksButton";
import { FilterBar } from "@/components/FilterBar";
import { InlineSpinner } from "@/components/PageSpinner";
import { SortableHeader } from "@/components/SortableHeader";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { type Member, useMembers } from "@/features/members/api";
import { useSprints } from "@/features/sprints/api";
import { type TaskStatus, useTasks } from "@/features/tasks/api";
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
import { useProjects } from "@/features/projects/api";
import { useProjectTasksRealtime } from "@/features/realtime/useProjectTasksRealtime";
import { isSprintsEnabled, useWorkspaces } from "@/features/workspaces/api";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

import { EmptyState } from "@/components/EmptyState";
import { PriorityPill, StatusPill } from "@/components/StatusPill";
import { TaskTableCard, TaskTableHead } from "@/components/TaskTableCard";

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

// Columns that support sort; mapped to the canonical SortField used by
// applySort. Columns not listed render their label as plain text.
const COL_SORT_FIELD: Partial<Record<ColKey, SortField>> = {
  id: "identifier",
  title: "title",
  status: "status",
  priority: "priority",
  due: "due_date",
  created: "created_at",
};

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
  columns,
  hidden,
  onToggle,
}: {
  // Caller-provided column list — typically a feature-flag-filtered subset
  // of the module-scope COLUMNS so e.g. Sprint disappears here when the
  // workspace has Sprints disabled.
  columns: { key: ColKey; label: string }[];
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
        className="inline-flex h-7 items-center gap-1.5 text-xs text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-100 border border-slate-200 dark:border-neutral-700 hover:border-slate-300 dark:hover:border-neutral-600 rounded-full px-2.5 transition-colors"
      >
        <ColumnsIcon />
        <span>Columns</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-neutral-900 rounded-md border border-slate-200 dark:border-neutral-800 shadow-lg z-10 py-1">
          {columns.map((c) => (
            <label
              key={c.key}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600 dark:text-neutral-400 hover:bg-slate-50 dark:hover:bg-neutral-800/50 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={!hidden.has(c.key)}
                onChange={() => onToggle(c.key)}
                className="rounded border-slate-300 dark:border-neutral-700"
              />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function DueDateCell({ date, status }: { date: string; status?: TaskStatus }) {
  // Done / cancelled: due date is informational only, no overdue red.
  const completed = status === "done" || status === "cancelled";
  const due = parseDueDate(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdue = !completed && due.getTime() < today.getTime();
  const soon =
    !completed &&
    !overdue &&
    due.getTime() - today.getTime() < 3 * 24 * 60 * 60 * 1000;
  const cls = overdue
    ? "text-red-500 dark:text-red-400"
    : soon
      ? "text-amber-600"
      : "text-slate-600 dark:text-neutral-400";
  return (
    <span className={`text-xs ${cls}`}>
      {due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
    </span>
  );
}

export default function TaskList() {
  useDocumentTitle("List");
  const { pKey } = useParams();
  // Re-mount the inner component when the project changes so filter / sort
  // state lazy-initializes from the new project's localStorage cleanly.
  return <TaskListContent key={pKey ?? ""} />;
}

function TaskListContent() {
  const { wsSlug, pKey } = useParams();
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const sprintsEnabled = isSprintsEnabled(currentWs);
  const { data: projects = [] } = useProjects(currentWs?.id ?? "");
  const currentProject = projects.find((p) => p.key === pKey);
  useProjectTasksRealtime(currentProject?.id);

  const filterKey = currentProject?.id
    ? `tracker.list.filters.${currentProject.id}`
    : "";
  const sortKey = currentProject?.id
    ? `tracker.list.sort.${currentProject.id}`
    : "";
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

  const { data: tasks = [], isLoading } = useTasks(currentProject?.id ?? "");
  const { data: members = [] } = useMembers(currentWs?.id ?? "");
  const { data: sprints = [] } = useSprints(currentProject?.id ?? "");

  const memberByUser = useMemo(() => {
    const m = new Map<string, Member>();
    for (const mb of members) m.set(mb.user_id, mb);
    return m;
  }, [members]);

  const sprintById = useMemo(
    () => new Map(sprints.map((s) => [s.id, s.name])),
    [sprints],
  );

  // Strip the Sprint column when the workspace has Sprints disabled. The
  // task.sprint_id is preserved on the row; we just stop offering it as a
  // visible / hideable column.
  const columns = useMemo(
    () => COLUMNS.filter((c) => c.key !== "sprint" || sprintsEnabled),
    [sprintsEnabled],
  );

  const [hiddenColumns, setHiddenColumns] = useHiddenColumns(
    currentProject?.id ?? "",
  );
  const toggleColumn = (key: ColKey) => {
    const next = new Set(hiddenColumns);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setHiddenColumns(next);
  };
  // A column renders only if (a) it's in the filtered `columns` list (i.e.
  // not stripped by a workspace feature flag) and (b) the user hasn't
  // toggled it off via ColumnVisibilityMenu. Without the columns-set check
  // here, body <td>s would still render for flag-stripped columns and the
  // table would misalign.
  const visibleColumnKeys = useMemo(
    () => new Set(columns.map((c) => c.key)),
    [columns],
  );
  const show = (key: ColKey) =>
    visibleColumnKeys.has(key) && !hiddenColumns.has(key);

  const displayedTasks = useMemo(() => {
    const filtered = applyFilters(tasks, filters);
    if (sort) return applySort(filtered, sort);
    // Default: newest first.
    return [...filtered].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [tasks, filters, sort]);

  if (!currentProject) return null;

  return (
    <div>
      <div className="mb-2">
        <FilterBar
          filters={filters}
          onFiltersChange={setFilters}
          trailing={
            <div className="flex items-center gap-2">
              <ColumnVisibilityMenu
                columns={columns}
                hidden={hiddenColumns}
                onToggle={toggleColumn}
              />
              <ExportTasksButton
                tasks={displayedTasks}
                members={members}
                sprints={sprintsEnabled ? sprints : []}
                filename={`${currentProject.name} tasks`}
              />
            </div>
          }
        />
      </div>

      {isLoading && <InlineSpinner />}
      {!isLoading && displayedTasks.length === 0 && (
        <EmptyState
          title={filters.length > 0 ? "No tasks match" : "No tasks yet"}
          description={
            filters.length > 0
              ? "Adjust the filters above, or clear them to see all tasks."
              : "Create your first task to get started."
          }
        />
      )}
      {!isLoading && displayedTasks.length > 0 && (
        <TaskTableCard>
          <TaskTableHead>
            <tr className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-neutral-400">
              {columns.map((c) => {
                if (!show(c.key)) return null;
                const sortField = COL_SORT_FIELD[c.key];
                const widthCls =
                  c.key === "id"
                    ? "w-24"
                    : c.key === "title"
                      ? "w-2/5"
                      : c.key === "status"
                        ? "w-32"
                        : c.key === "priority"
                          ? "w-28"
                          : c.key === "assignee"
                            ? "w-40"
                            : c.key === "due"
                              ? "w-24"
                              : c.key === "sprint"
                                ? "w-32"
                                : c.key === "created"
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
          <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
            {displayedTasks.map((t) => {
              const assignee = t.assignee_id
                ? memberByUser.get(t.assignee_id)
                : undefined;
              const assigneeLabel =
                assignee?.display_name || assignee?.email || null;
              const sprintName = t.sprint_id
                ? sprintById.get(t.sprint_id)
                : undefined;
              return (
                <tr
                  key={t.id}
                  className="cursor-pointer hover:bg-slate-50 dark:hover:bg-neutral-800/40 transition-colors"
                  onClick={() => setOpenTaskId(t.id)}
                >
                  {show("id") && (
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-500 dark:text-neutral-400">
                      {t.identifier}
                    </td>
                  )}
                  {show("title") && (
                    <td className="px-3 py-2.5 text-slate-800 dark:text-neutral-200" title={t.title}>
                      <div className="truncate">{t.title}</div>
                    </td>
                  )}
                  {show("status") && (
                    <td className="px-3 py-2.5">
                      <StatusPill status={t.status} />
                    </td>
                  )}
                  {show("priority") && (
                    <td className="px-3 py-2.5">
                      <PriorityPill priority={t.priority} hideNoPriority />
                    </td>
                  )}
                  {show("assignee") && (
                    <td className="px-3 py-2.5">
                      {assignee ? (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Avatar
                            displayName={assignee.display_name}
                            email={assignee.email}
                            avatarUrl={assignee.avatar_url}
                            color={assignee.avatar_color}
                          />
                          <span className="text-xs text-slate-700 dark:text-neutral-300 truncate">
                            {assigneeLabel}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300 dark:text-neutral-600">—</span>
                      )}
                    </td>
                  )}
                  {show("due") && (
                    <td className="px-3 py-2.5">
                      {t.due_date ? (
                        <DueDateCell date={t.due_date} status={t.status} />
                      ) : (
                        <span className="text-xs text-slate-300 dark:text-neutral-600">—</span>
                      )}
                    </td>
                  )}
                  {show("sprint") && (
                    <td className="px-3 py-2.5">
                      {sprintName ? (
                        <span className="text-xs text-slate-700 dark:text-neutral-300 truncate block">
                          {sprintName}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300 dark:text-neutral-600">—</span>
                      )}
                    </td>
                  )}
                  {show("created") && (
                    <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-neutral-400">
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
        </TaskTableCard>
      )}
      <TaskDetailModal
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
      />
    </div>
  );
}
