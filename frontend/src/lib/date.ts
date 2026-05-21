// Date helpers tuned for `tasks.due_date` semantics.
//
// `due_date` columns hold a calendar date (no time, no zone) — when JS
// parses the bare ISO string ("2026-05-21") via `new Date(s)`, the spec
// dictates UTC midnight. In any timezone west of UTC that midnight
// renders as the PREVIOUS day, so a task due "today" shows as
// "yesterday" + a misleading red "overdue" badge.
//
// The helpers below parse by splitting Y/M/D and constructing via the
// (year, monthIndex, day) form, which the spec routes through LOCAL
// time — matching the user's lived experience of the calendar.

function parseLocal(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function parseDueDate(s: string): Date {
  return parseLocal(s);
}

export function isOverdueDate(s: string): boolean {
  return parseLocal(s).getTime() < new Date().setHours(0, 0, 0, 0);
}

export function isTodayDate(s: string): boolean {
  const d = parseLocal(s);
  const t = new Date();
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
}

// User-local "today" as YYYY-MM-DD. Pass this to backend endpoints that
// pivot on "is this overdue / due today / done this week" so they answer
// in the viewer's calendar rather than the server's (UTC) calendar.
// `toISOString().slice(0,10)` would route through UTC and off-by-one in
// any non-UTC timezone — same bug class that parseDueDate fixes.
export function todayLocalString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
