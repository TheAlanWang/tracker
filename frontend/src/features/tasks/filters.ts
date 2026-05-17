// Shared filter + sort logic for every filterable task view (List, Backlog,
// My Tasks). Pages keep their own local state for active filters / sort,
// persist it per scope (project id, workspace id) via the load*/save* helpers
// here, and apply it on the client via applyFilters / applySort.
//
// Filter union covers four task-intrinsic fields:
//   - Status / Priority — multi-select against TaskStatus / TaskPriority
//   - Due — preset radio (overdue / today / this week / next 7 / has date /
//     no date), matched via matchDuePreset
//   - Project — multi-select of project ids; the consumer page supplies the
//     option list since filters.ts doesn't know about the projects API
//
// Sort is a single (field, direction) pair. Default direction is asc on the
// FIRST click of a sortable header; the SortableHeader component cycles
// asc → desc → null on subsequent clicks.

import type { Task, TaskPriority, TaskStatus } from "./api";

// ---- Filter types ----

export type DuePreset =
  | "overdue"
  | "today"
  | "this_week"
  | "next_7_days"
  | "has_date"
  | "no_date";

export type StatusFilter = { field: "status"; values: TaskStatus[] };
export type PriorityFilter = { field: "priority"; values: TaskPriority[] };
export type DueFilter = { field: "due"; preset: DuePreset };
// ProjectFilter stores project IDs (opaque to the filter system); the
// consumer page supplies the available project options + label lookup.
export type ProjectFilter = { field: "project"; values: string[] };

export type Filter = StatusFilter | PriorityFilter | DueFilter | ProjectFilter;
export type FilterField = Filter["field"];

export const FILTER_FIELD_LABELS: Record<FilterField, string> = {
  status: "Status",
  priority: "Priority",
  due: "Due date",
  project: "Project",
};

export const DUE_PRESET_LABELS: Record<DuePreset, string> = {
  overdue: "Overdue",
  today: "Today",
  this_week: "This week",
  next_7_days: "Next 7 days",
  has_date: "Has date",
  no_date: "No date",
};

export const DUE_PRESETS: DuePreset[] = [
  "overdue",
  "today",
  "this_week",
  "next_7_days",
  "has_date",
  "no_date",
];

// ---- Sort types ----

export type SortField =
  | "identifier"
  | "title"
  | "status"
  | "priority"
  | "due_date"
  | "created_at"
  | "updated_at";

export type SortDirection = "asc" | "desc";
export type SortState = { field: SortField; direction: SortDirection } | null;

export const SORT_FIELD_LABELS: Record<SortField, string> = {
  identifier: "ID",
  title: "Title",
  status: "Status",
  priority: "Priority",
  due_date: "Due date",
  created_at: "Created",
  updated_at: "Updated",
};

// ---- Defaults ----

export function defaultFilterFor(field: FilterField): Filter {
  switch (field) {
    case "status":
      return { field: "status", values: ["todo"] };
    case "priority":
      return { field: "priority", values: ["urgent"] };
    case "due":
      return { field: "due", preset: "overdue" };
    case "project":
      return { field: "project", values: [] };
  }
}

// ---- Matchers ----

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfThisWeek(): number {
  // Treat "this week" as today through end of Sunday (locale-friendly approx).
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const daysUntilSunday = (7 - today.getDay()) % 7; // 0=Sunday
  today.setDate(today.getDate() + daysUntilSunday);
  return today.getTime();
}

function endOfNext7Days(): number {
  return startOfToday() + 7 * 24 * 60 * 60 * 1000;
}

export function matchDuePreset(
  dueIso: string | null,
  preset: DuePreset,
): boolean {
  if (preset === "no_date") return dueIso === null;
  if (preset === "has_date") return dueIso !== null;
  if (dueIso === null) return false;

  const dueTime = new Date(dueIso).setHours(0, 0, 0, 0);
  switch (preset) {
    case "overdue":
      return dueTime < startOfToday();
    case "today":
      return dueTime === startOfToday();
    case "this_week":
      return dueTime >= startOfToday() && dueTime <= endOfThisWeek();
    case "next_7_days":
      return dueTime >= startOfToday() && dueTime <= endOfNext7Days();
  }
}

export function matchFilter(t: Task, f: Filter): boolean {
  if (f.field === "status") {
    return f.values.length === 0 ? true : f.values.includes(t.status);
  }
  if (f.field === "priority") {
    return f.values.length === 0 ? true : f.values.includes(t.priority);
  }
  if (f.field === "due") {
    return matchDuePreset(t.due_date, f.preset);
  }
  if (f.field === "project") {
    return f.values.length === 0 ? true : f.values.includes(t.project_id);
  }
  return true;
}

export function applyFilters(tasks: Task[], filters: Filter[]): Task[] {
  if (filters.length === 0) return tasks;
  return tasks.filter((t) => filters.every((f) => matchFilter(t, f)));
}

// ---- Sort ----

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  no_priority: 4,
};
const STATUS_ORDER: Record<TaskStatus, number> = {
  backlog: 0,
  todo: 1,
  in_progress: 2,
  in_review: 3,
  done: 4,
  cancelled: 5,
};

export function applySort<T extends Task>(items: T[], sort: SortState): T[] {
  if (!sort) return items;
  const dir = sort.direction === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    let cmp = 0;
    switch (sort.field) {
      case "identifier": {
        // identifier is like "TES-12" — split into prefix + number for natural sort
        const [ap, an] = splitIdentifier(a.identifier);
        const [bp, bn] = splitIdentifier(b.identifier);
        cmp = ap.localeCompare(bp) || an - bn;
        break;
      }
      case "title":
        cmp = a.title.localeCompare(b.title);
        break;
      case "status":
        cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        break;
      case "priority":
        cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        break;
      case "due_date":
        cmp = nullableTimeCompare(a.due_date, b.due_date);
        break;
      case "created_at":
        cmp =
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        break;
      case "updated_at":
        cmp =
          new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
        break;
    }
    return cmp * dir;
  });
}

function splitIdentifier(s: string): [string, number] {
  const m = s.match(/^([A-Z]+)-?(\d+)$/i);
  if (!m) return [s, 0];
  return [m[1], parseInt(m[2], 10)];
}

function nullableTimeCompare(a: string | null, b: string | null): number {
  // null sorts last regardless of direction (push absent values to end).
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return new Date(a).getTime() - new Date(b).getTime();
}

// ---- Persistence ----

export function loadFilters(key: string): Filter[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Filter[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveFilters(key: string, filters: Filter[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(filters));
  } catch {
    // ignore quota errors
  }
}

export function loadSort(key: string): SortState {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SortState;
    return parsed ?? null;
  } catch {
    return null;
  }
}

export function saveSort(key: string, sort: SortState): void {
  try {
    localStorage.setItem(key, JSON.stringify(sort));
  } catch {
    // ignore
  }
}
