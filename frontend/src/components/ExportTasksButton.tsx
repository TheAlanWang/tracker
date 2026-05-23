// ExportTasksButton — drop-in CSV export for any task list. Takes the
// already-loaded array plus optional resolver maps (members, sprints)
// so the output renders human-readable names instead of UUIDs.
//
// Doesn't touch the network — exports exactly the array passed in,
// which means filter / sort state from the parent is preserved without
// any extra wiring.

import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import type { Member } from "@/features/members/api";
import type { Sprint } from "@/features/sprints/api";
import type { Task } from "@/features/tasks/api";
import { PRIORITY, STATUS } from "@/features/tasks/labels";
import { type CsvColumn, downloadCsv, toCsv } from "@/lib/csv";

type Props = {
  tasks: Task[];
  // Used as the downloaded file's name (without `.csv`). E.g. "Frontend
  // backlog" → "Frontend backlog.csv".
  filename: string;
  // Optional resolvers for nicer output. Omit and the column is empty.
  members?: Member[];
  sprints?: Sprint[];
  // Override button label / variant if you want to fit a specific
  // toolbar; default is the standard outline button.
  label?: string;
  className?: string;
};

export function ExportTasksButton({
  tasks,
  filename,
  members = [],
  sprints = [],
  label = "Export CSV",
  className,
}: Props) {
  const memberById = useMemo(
    () => new Map(members.map((m) => [m.user_id, m])),
    [members],
  );
  const sprintById = useMemo(
    () => new Map(sprints.map((s) => [s.id, s])),
    [sprints],
  );

  function onClick() {
    const columns: CsvColumn<Task>[] = [
      { label: "Identifier", value: (t) => t.identifier },
      { label: "Title", value: (t) => t.title },
      { label: "Status", value: (t) => STATUS[t.status].label },
      {
        label: "Priority",
        // Hide the "No priority" placeholder — empty cell reads cleaner
        // in spreadsheets than redundant text.
        value: (t) =>
          t.priority === "no_priority" ? "" : PRIORITY[t.priority].label,
      },
      {
        label: "Assignee",
        value: (t) => {
          if (!t.assignee_id) return "";
          const m = memberById.get(t.assignee_id);
          return m?.display_name || m?.email || t.assignee_id;
        },
      },
      { label: "Due date", value: (t) => t.due_date ?? "" },
      {
        label: "Sprint",
        value: (t) => (t.sprint_id ? sprintById.get(t.sprint_id)?.name ?? "" : ""),
      },
      { label: "Created at", value: (t) => t.created_at },
      { label: "Updated at", value: (t) => t.updated_at },
    ];
    const csv = toCsv(tasks, columns);
    downloadCsv(`${filename}.csv`, csv);
  }

  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={tasks.length === 0}
      className={className}
      title={
        tasks.length === 0
          ? "No tasks to export"
          : `Export ${tasks.length} task${tasks.length === 1 ? "" : "s"} as CSV`
      }
    >
      {label}
    </Button>
  );
}
