import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { ExportTasksButton } from "@/components/ExportTasksButton";
import { FilterBar } from "@/components/FilterBar";
import { InlineTaskCreator } from "@/components/InlineTaskCreator";
import { SortableHeader } from "@/components/SortableHeader";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { useMembers } from "@/features/members/api";
import { useProjects } from "@/features/projects/api";
import { useProjectTasksRealtime } from "@/features/realtime/useProjectTasksRealtime";
import { useTasks } from "@/features/tasks/api";
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
import { EmptyState } from "@/components/EmptyState";
import { PriorityPill } from "@/components/StatusPill";
import { TaskTableCard, TaskTableHead } from "@/components/TaskTableCard";
import { useWorkspaces } from "@/features/workspaces/api";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

type ColKey = "id" | "title" | "priority" | "assignee" | "due" | "created";

const COLUMNS: { key: ColKey; label: string }[] = [
  { key: "id", label: "ID" },
  { key: "title", label: "Title" },
  { key: "priority", label: "Priority" },
  { key: "assignee", label: "Assignee" },
  { key: "due", label: "Due" },
  { key: "created", label: "Created" },
];

const COL_SORT_FIELD: Partial<Record<ColKey, SortField>> = {
  id: "identifier",
  title: "title",
  priority: "priority",
  due: "due_date",
  created: "created_at",
};

function useHiddenColumns(projectId: string) {
  const key = projectId ? `tracker.backlog.hidden.${projectId}` : "";
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
        <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800 shadow-lg z-10 py-1">
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
      : "text-slate-600 dark:text-slate-400";
  return (
    <span className={`text-xs ${cls}`}>
      {due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
    </span>
  );
}

export default function Backlog() {
  useDocumentTitle("Backlog");
  const { pKey } = useParams();
  return <BacklogContent key={pKey ?? ""} />;
}

function BacklogContent() {
  const { wsSlug, pKey } = useParams();
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const { data: projects = [] } = useProjects(currentWs?.id ?? "");
  const currentProject = projects.find((p) => p.key === pKey);
  useProjectTasksRealtime(currentProject?.id);

  const filterKey = currentProject?.id
    ? `tracker.backlog.filters.${currentProject.id}`
    : "";
  const sortKey = currentProject?.id
    ? `tracker.backlog.sort.${currentProject.id}`
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

  const { data: tasks = [], isLoading } = useTasks(currentProject?.id ?? "", {
    status: "backlog",
  });
  const { data: members = [] } = useMembers(currentWs?.id ?? "");

  const memberByUser = useMemo(() => {
    const m = new Map<string, string>();
    for (const mb of members) if (mb.email) m.set(mb.user_id, mb.email);
    return m;
  }, [members]);

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
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Ideas and unscheduled work. Set priority and a due date, then move to{" "}
        <span className="font-medium text-slate-700 dark:text-slate-300">To Do</span> or pull into a
        sprint when you're ready to start.
      </p>

      <FilterBar
        filters={filters}
        onFiltersChange={setFilters}
        // Status is always "backlog" on this page — no need to expose.
        availableFilterFields={["priority", "due"]}
        trailing={
          <div className="flex items-center gap-2">
            <ExportTasksButton
              tasks={displayedTasks}
              members={members}
              filename={`${currentProject.name} backlog`}
            />
            <ColumnVisibilityMenu hidden={hiddenColumns} onToggle={toggleColumn} />
          </div>
        }
      />

      {isLoading && <p>Loading…</p>}

      {!isLoading && displayedTasks.length === 0 && (
        <EmptyState
          title={filters.length > 0 ? "No backlog tasks match" : "Backlog is empty"}
          description={
            filters.length > 0
              ? "Adjust the filters above, or clear them to see all backlog tasks."
              : "Tasks in Backlog status show up here."
          }
        />
      )}
      {!isLoading && displayedTasks.length > 0 && (
        <TaskTableCard>
          <TaskTableHead>
            <tr className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {COLUMNS.map((c) => {
                if (!show(c.key)) return null;
                const sortField = COL_SORT_FIELD[c.key];
                const widthCls =
                  c.key === "id"
                    ? "w-24"
                    : c.key === "title"
                      ? "w-2/5"
                      : c.key === "priority"
                        ? "w-28"
                        : c.key === "assignee"
                          ? "w-40"
                          : c.key === "due"
                            ? "w-24"
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
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {displayedTasks.map((t) => {
              const assigneeEmail = t.assignee_id
                ? memberByUser.get(t.assignee_id)
                : undefined;
              return (
                <tr
                  key={t.id}
                  className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  onClick={() => setOpenTaskId(t.id)}
                >
                  {show("id") && (
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                      {t.identifier}
                    </td>
                  )}
                  {show("title") && (
                    <td className="px-3 py-2.5 text-slate-800 dark:text-slate-200" title={t.title}>
                      <div className="truncate">{t.title}</div>
                    </td>
                  )}
                  {show("priority") && (
                    <td className="px-3 py-2.5">
                      <PriorityPill priority={t.priority} hideNoPriority />
                    </td>
                  )}
                  {show("assignee") && (
                    <td className="px-3 py-2.5">
                      {assigneeEmail ? (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Avatar email={assigneeEmail} />
                          <span className="text-xs text-slate-700 dark:text-slate-300 truncate">
                            {assigneeEmail}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                  )}
                  {show("due") && (
                    <td className="px-3 py-2.5">
                      {t.due_date ? (
                        <DueDateCell date={t.due_date} />
                      ) : (
                        <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                  )}
                  {show("created") && (
                    <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">
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

      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2">
        <InlineTaskCreator
          projectId={currentProject.id}
          status="backlog"
          triggerLabel="+ Add task to backlog"
          triggerClassName="w-full text-left text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded px-2 py-1.5 transition-colors"
        />
      </div>

      <TaskDetailModal
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
      />
    </div>
  );
}
