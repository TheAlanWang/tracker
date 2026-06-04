import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Maximize2 } from "lucide-react";

import { TaskDetailContent } from "@/pages/TaskDetail";
import { useTask } from "@/features/tasks/api";
import { useWorkspaces } from "@/features/workspaces/api";
import { useProjects } from "@/features/projects/api";

function CloseIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="w-5 h-5"
    >
      <path
        fillRule="evenodd"
        d="M4.28 3.22a.75.75 0 0 0-1.06 1.06L8.94 10l-5.72 5.72a.75.75 0 1 0 1.06 1.06L10 11.06l5.72 5.72a.75.75 0 1 0 1.06-1.06L11.06 10l5.72-5.72a.75.75 0 0 0-1.06-1.06L10 8.94 4.28 3.22Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

type Props = {
  taskId: string | null;
  onClose: () => void;
};

export function TaskDetailModal({ taskId, onClose }: Props) {
  // Canonical URL for the expand button (opens the full task page inside its
  // workspace). Built from the task's workspace + project — derived from
  // already-warm caches — rather than a bare /t/identifier shortlink, so it's
  // unambiguous even when another workspace shares the same project key + task
  // number. Rendered as a <Link>, so left-click navigates IN THE SAME TAB
  // (reusing the board's warm React Query cache → fast), while ⌘/Ctrl/middle-
  // click still opens a new tab for anyone who wants the task side-by-side.
  // The task is already cached from the open content (same query key), so this
  // adds no network; empty args keep the dependent queries disabled.
  const { data: task } = useTask(taskId ?? "");
  const { data: workspaces = [] } = useWorkspaces();
  const ws = workspaces.find((w) => w.id === task?.workspace_id);
  const { data: projects = [] } = useProjects(ws?.id ?? "");
  const project = projects.find((p) => p.id === task?.project_id);
  const fullUrl =
    task && ws && project
      ? `/w/${ws.slug}/p/${project.key}/tasks/${task.identifier}`
      : null;

  // Esc to close
  useEffect(() => {
    if (!taskId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [taskId, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!taskId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [taskId]);

  if (!taskId) return null;

  // Render into document.body via portal so the backdrop escapes any
  // ancestor stacking/containing-block (e.g. WorkspaceLayout's <main>
  // with overflow-auto) and reliably covers the entire viewport.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 p-0 sm:p-8 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative my-0 min-h-full w-full max-w-5xl rounded-none bg-white dark:bg-neutral-900 shadow-2xl sm:my-4 sm:min-h-0 sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {fullUrl && (
          <Link
            to={fullUrl}
            className="absolute right-12 top-3 z-10 hidden sm:inline-flex h-8 w-8 items-center justify-center rounded text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800 hover:text-slate-900 dark:hover:text-neutral-100"
            aria-label="Open full page"
            title="Open full page (⌘-click for a new tab)"
          >
            <Maximize2 className="w-4 h-4" />
          </Link>
        )}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800 hover:text-slate-900 dark:hover:text-neutral-100"
          aria-label="Close"
        >
          <CloseIcon />
        </button>
        <div className="px-4 pb-6 pt-5 sm:px-8 sm:pb-8 sm:pt-6">
          <TaskDetailContent taskId={taskId} onDeleted={onClose} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
