import { useEffect } from "react";
import { createPortal } from "react-dom";

import { TaskDetailContent } from "@/pages/TaskDetail";

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
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 p-4 sm:p-8 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative my-4 w-full max-w-5xl rounded-lg bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          aria-label="Close"
        >
          <CloseIcon />
        </button>
        <div className="px-8 pb-8 pt-6">
          <TaskDetailContent taskId={taskId} onDeleted={onClose} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
