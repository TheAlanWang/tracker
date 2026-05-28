// Archived-tasks view. Thin wrapper around TaskListContent with
// `archived={true}` — the underlying table, filter bar, column visibility
// and Realtime subscription all work the same; only the data set is
// different. See TaskList.tsx for the shared rendering logic.

import { useParams } from "react-router-dom";

import { TaskListContent } from "@/pages/TaskList";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function Archive() {
  useDocumentTitle("Archive");
  const { pKey } = useParams();
  return <TaskListContent key={pKey ?? ""} archived={true} />;
}
