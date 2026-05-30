// Standalone, chrome-less task view — opened in a new tab by the task
// modal's "expand" button. Unlike the in-workspace full page (which renders
// inside WorkspaceLayout with the sidebar + "Back to …" header), this route
// lives outside the layout and shows nothing but the task itself.

import { useParams } from "react-router-dom";

import { PageSpinner } from "@/components/PageSpinner";
import { TaskDetailContent } from "@/pages/TaskDetail";
import { useResolveIdentifier } from "@/features/tasks/api";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function TaskStandalone() {
  useDocumentTitle("Task");
  const { identifier } = useParams();
  const {
    data: resolved,
    isLoading,
    isError,
  } = useResolveIdentifier(identifier ?? "");

  if (isError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-white dark:bg-neutral-950">
        <p className="text-lg font-medium text-slate-700 dark:text-neutral-300">
          Task not found
        </p>
        <a href="/" className="text-sm text-blue-600 hover:underline">
          Back to home
        </a>
      </div>
    );
  }
  if (isLoading || !resolved) {
    return (
      <div className="min-h-screen bg-white dark:bg-neutral-950">
        <PageSpinner />
      </div>
    );
  }

  // Centered card on a muted page background — mirrors the modal's card
  // proportions (max-w-5xl + padding) so the standalone view reads as one
  // focused document rather than bare content sprawled across the viewport.
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-neutral-950 py-8 px-4 sm:px-8">
      <div className="mx-auto w-full max-w-6xl rounded-lg border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm px-8 pb-8 pt-6">
        <TaskDetailContent taskId={resolved.task_id} />
      </div>
    </div>
  );
}
