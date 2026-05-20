import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { Avatar } from "@/components/Avatar";
import { type Member } from "@/features/members/api";
import { useUpdateTask } from "@/features/tasks/api";

type Props = {
  taskId: string;
  currentAssigneeId: string | null;
  members: Member[];
  // The trigger element — usually an Avatar wrapped in a button.
  children: (props: {
    open: () => void;
    triggerRef: React.RefObject<HTMLButtonElement | null>;
  }) => React.ReactNode;
};

// Click an Avatar → popover with a member list → pick one to (re)assign.
// Closes on outside click / Esc. Stops propagation so the underlying
// card/row click doesn't fire.
export function AssigneePicker({
  taskId,
  currentAssigneeId,
  members,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const update = useUpdateTask(taskId);

  useEffect(() => {
    if (!open) return;
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      // Viewport-aware positioning: default to anchoring the popover's
      // top-left to the trigger's bottom-left, but flip horizontally /
      // vertically if that would push the popover off-screen. Trigger
      // sitting near the right edge of the window otherwise clips the
      // member list. Same idea as Floating-UI's "shift" middleware.
      const POPOVER_W = 240;
      const POPOVER_MAX_H = 320;
      const MARGIN = 8;
      let left = r.left;
      if (left + POPOVER_W + MARGIN > window.innerWidth) {
        // Right-align to the trigger instead of left-align.
        left = Math.max(MARGIN, r.right - POPOVER_W);
      }
      let top = r.bottom + 4;
      if (top + POPOVER_MAX_H + MARGIN > window.innerHeight) {
        // Flip above the trigger.
        top = Math.max(MARGIN, r.top - POPOVER_MAX_H - 4);
      }
      setPos({ left, top });
    }
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
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

  async function assign(userId: string | null) {
    setOpen(false);
    try {
      await update.mutateAsync({ assignee_id: userId } as never);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to assign";
      toast.error(detail);
    }
  }

  return (
    <>
      {children({ open: () => setOpen(true), triggerRef })}
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              left: pos.left,
              top: pos.top,
              width: 240,
            }}
            className="z-50 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl py-1 max-h-[320px] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                assign(null);
              }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2 ${
                currentAssigneeId === null ? "bg-slate-50 dark:bg-slate-800/40" : ""
              }`}
            >
              <div className="w-6 h-6 rounded-full border-2 border-dashed border-slate-300 dark:border-slate-700 shrink-0" />
              <span className="text-slate-700 dark:text-slate-300">Unassigned</span>
              {currentAssigneeId === null && (
                <span className="ml-auto text-blue-600 text-xs">✓</span>
              )}
            </button>
            {members.length > 0 && (
              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
            )}
            {members.map((m) => {
              const isCurrent = m.user_id === currentAssigneeId;
              const label = m.display_name || m.email || m.user_id;
              return (
                <button
                  key={m.user_id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    assign(m.user_id);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2 ${
                    isCurrent ? "bg-slate-50 dark:bg-slate-800/40" : ""
                  }`}
                >
                  <Avatar
                    displayName={m.display_name}
                    email={m.email}
                    size={24}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-slate-900 dark:text-slate-100 truncate">{label}</p>
                    {m.display_name && m.email && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                        {m.email}
                      </p>
                    )}
                  </div>
                  {isCurrent && (
                    <span className="text-blue-600 text-xs">✓</span>
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
