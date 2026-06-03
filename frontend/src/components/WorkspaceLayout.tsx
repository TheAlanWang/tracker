// WorkspaceLayout — the chrome around every signed-in workspace page.
//
// Renders three regions:
//   1. Top bar — workspace switcher (dropdown), command palette trigger,
//      bell icon (inbox popover with task notifications + pending workspace
//      invitations), and avatar menu (Settings / theme switcher / Sign out).
//   2. Sidebar (SidebarNav, below) — Dashboard / My Tasks at the top,
//      then a Projects section listing every project in the workspace with
//      a "+" to create a new one. Each row has a stable per-key dot color
//      (hash → hue) and an on-hover gear that opens project settings.
//   3. <Outlet /> — the routed page content.
//
// State note: `onSettingsPage` swaps the global SidebarNav for
// SettingsSidebar (same frame, different content) on Workspace / Profile /
// Project Settings routes. Pages that register sections via
// useSectionSidebar also get a tier-2 SectionSidebar overlay beside it.

import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CreditCard, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { CommandPalette } from "@/components/CommandPalette";
import { SettingsSidebar } from "@/components/SettingsSidebar";
import { SectionSidebar } from "@/components/SectionSidebar";
import { SectionSidebarProvider } from "@/components/SectionSidebarContext";
import { Avatar } from "@/components/Avatar";
import { ProBadge } from "@/components/ProBadge";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useAcceptInvitation,
  useDeclineInvitation,
  useMyInvitations,
} from "@/features/invitations/api";
import {
  type Notification,
  useMarkAllRead,
  useMarkRead,
  useNotifications,
} from "@/features/notifications/api";
import {
  useCreateProject,
  useProjects,
} from "@/features/projects/api";
import { useNotificationsRealtime } from "@/features/realtime/useNotificationsRealtime";
import { useWorkspaces } from "@/features/workspaces/api";
import { CreateWorkspaceForm } from "@/features/workspaces/CreateWorkspaceForm";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useTheme } from "@/hooks/useTheme";
import { projectDotColor } from "@/lib/projectColor";
import { useCommandPaletteStore } from "@/lib/commandPaletteStore";
import { supabase } from "@/lib/supabase";

const LAST_WORKSPACE_KEY = "tracker.lastWorkspaceSlug";
const SIDEBAR_COLLAPSED_KEY = "tracker.sidebarCollapsed";

// Three-segment theme switch inside the avatar dropdown — Supabase /
// Vercel style. Visually segmented because users like to *see* which
// state they're in (vs. a single toggle that hides "system"). The
// active option fills with white card, the others sit on the muted
// dropdown background.
function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const options: { value: "light" | "system" | "dark"; icon: React.ReactNode; label: string }[] = [
    {
      value: "light",
      label: "Light",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ),
    },
    {
      value: "system",
      label: "System",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
          <rect x="3" y="4" width="18" height="12" rx="1.5" />
          <line x1="8" y1="20" x2="16" y2="20" />
          <line x1="12" y1="16" x2="12" y2="20" />
        </svg>
      ),
    },
    {
      value: "dark",
      label: "Dark",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
          <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8Z" />
        </svg>
      ),
    },
  ];
  return (
    <div className="px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-neutral-500 mb-1.5">
        Theme
      </div>
      <div className="grid grid-cols-3 gap-0.5 rounded-md bg-slate-100 dark:bg-neutral-800 p-0.5">
        {options.map((o) => {
          const active = theme === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => setTheme(o.value)}
              className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded text-[11px] transition-colors ${
                active
                  ? "bg-white dark:bg-neutral-700 text-slate-900 dark:text-neutral-200 shadow-sm"
                  : "text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-200"
              }`}
            >
              {o.icon}
              <span>{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Single row in the avatar/profile dropdown. Hand-rolled (not a shadcn
// DropdownMenuItem) so the icon column + text baseline align exactly
// the way the surrounding layout wants — small footprint, easier than
// fighting Radix defaults.
function ProfileMenuItem({
  icon,
  onClick,
  children,
  variant = "default",
}: {
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
  variant?: "default" | "danger";
}) {
  const text =
    variant === "danger"
      ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
      : "text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800 hover:text-slate-900 dark:hover:text-neutral-100";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors ${text}`}
    >
      <span
        className={
          variant === "danger"
            ? "text-red-500 shrink-0"
            : "text-slate-400 dark:text-neutral-500 shrink-0"
        }
      >
        {icon}
      </span>
      <span className="flex-1 text-left truncate">{children}</span>
    </button>
  );
}

function BellIcon({ filled }: { filled?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function notificationLabel(type: Notification["type"]): string {
  switch (type) {
    case "assigned":
      return "Assigned to you";
    case "commented":
      return "New comment";
    case "mentioned":
      return "Mentioned you";
    case "status_changed":
      return "Status changed";
    case "invitation_accepted":
      return "accepted your invitation";
    case "invitation_declined":
      return "declined your invitation";
    case "ownership_transferred":
      return "made you the owner of";
    case "unblocked":
      return "Unblocked";
    default:
      return type;
  }
}

// Small corner badge overlaid on the avatar — indicates what kind of
// activity (assigned / commented / mentioned / status_changed).
function NotificationTypeIcon({ type }: { type: Notification["type"] }) {
  const base =
    "w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-white dark:ring-neutral-900";
  if (type === "assigned") {
    return (
      <div className={`${base} bg-blue-500 text-white`}>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-2.5 h-2.5"
        >
          <circle cx="10" cy="7" r="3" />
          <path d="M4 17c1-3 3.5-4.5 6-4.5s5 1.5 6 4.5" />
        </svg>
      </div>
    );
  }
  if (type === "commented") {
    return (
      <div className={`${base} bg-purple-500 text-white`}>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-2.5 h-2.5"
        >
          <path d="M3 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8l-4 3v-3H5a2 2 0 0 1-2-2Z" />
        </svg>
      </div>
    );
  }
  if (type === "mentioned") {
    return (
      <div className={`${base} bg-amber-500 text-white`}>
        <span className="text-[8px] font-bold leading-none">@</span>
      </div>
    );
  }
  if (type === "unblocked") {
    return (
      <div className={`${base} bg-emerald-500 text-white`}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-2.5 h-2.5"
          aria-hidden
        >
          {/* Open padlock — the shackle pivoted away from the body */}
          <rect x="6" y="12" width="12" height="8" rx="1.5" />
          <path d="M9 12V8a3 3 0 0 1 6 0" />
        </svg>
      </div>
    );
  }
  if (type === "status_changed") {
    return (
      <div className={`${base} bg-green-500 text-white`}>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-2.5 h-2.5"
        >
          <path d="M4 10a6 6 0 0 1 11-3" />
          <path d="M16 10a6 6 0 0 1-11 3" />
        </svg>
      </div>
    );
  }
  if (type === "invitation_accepted") {
    return (
      <div className={`${base} bg-emerald-500 text-white`}>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-2.5 h-2.5"
        >
          <path d="M4 10l4 4 8-8" />
        </svg>
      </div>
    );
  }
  if (type === "invitation_declined") {
    return (
      <div className={`${base} bg-slate-500 text-white`}>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-2.5 h-2.5"
        >
          <path d="M5 5l10 10M15 5L5 15" />
        </svg>
      </div>
    );
  }
  if (type === "ownership_transferred") {
    // Gold star to echo the Pro / ownership = premium-status cue.
    return (
      <div className={`${base} bg-[#C9A227] text-white`}>
        <span className="text-[8px] leading-none">★</span>
      </div>
    );
  }
  return (
    <div className={`${base} bg-slate-400 text-white`}>
      <span className="w-1 h-1 rounded-full bg-white dark:bg-neutral-900" />
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function InboxPopover({
  open,
  onClose,
  onOpenTask,
  triggerRect,
}: {
  open: boolean;
  onClose: () => void;
  onOpenTask: (taskId: string) => void;
  triggerRect: DOMRect | null;
}) {
  const navigate = useNavigate();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data: notifications = [], isLoading } = useNotifications({
    unreadOnly,
  });
  const { data: invitations = [] } = useMyInvitations();
  const acceptInvitation = useAcceptInvitation();
  const declineInvitation = useDeclineInvitation();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const ref = useRef<HTMLDivElement>(null);

  async function handleAcceptInvite(
    id: string,
    wsName: string | null,
    wsSlug: string | null,
  ) {
    try {
      await acceptInvitation.mutateAsync(id);
      toast.success(`Joined ${wsName ?? "workspace"}`);
      onClose();
      if (wsSlug) navigate(`/w/${wsSlug}`);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to accept invitation";
      toast.error(detail);
    }
  }

  async function handleDeclineInvite(id: string) {
    try {
      await declineInvitation.mutateAsync(id);
      toast.success("Invitation declined");
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to decline";
      toast.error(detail);
    }
  }

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      // Ignore clicks on the trigger button itself (it toggles open/close).
      if (triggerRect) {
        const { left, right, top, bottom } = triggerRect;
        const { clientX: x, clientY: y } = e;
        if (x >= left && x <= right && y >= top && y <= bottom) return;
      }
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, triggerRect]);

  if (!open || !triggerRect) return null;

  async function handleClick(n: Notification) {
    if (!n.read_at) {
      try {
        await markRead.mutateAsync(n.id);
      } catch {
        // non-blocking — still navigate (or just mark and stay)
      }
    }
    // Invitation outcomes have no task to open — clicking just marks them read.
    if (n.task_id) {
      onOpenTask(n.task_id);
      onClose();
    }
  }

  async function handleMarkAllRead() {
    try {
      const result = await markAllRead.mutateAsync();
      toast.success(`Marked ${result.count} as read`);
    } catch {
      toast.error("Failed to mark all as read");
    }
  }

  // Position popover under bell, right-aligned (clamped to viewport).
  const POPOVER_WIDTH = 480;
  const left = Math.max(8, triggerRect.right - POPOVER_WIDTH);
  const top = triggerRect.bottom + 6;

  const unread = notifications.filter((n) => !n.read_at);
  const earlier = notifications.filter((n) => n.read_at);
  const totalCount = notifications.length;

  function renderRow(n: Notification) {
    const isUnread = !n.read_at;
    const actor = n.actor_display_name || n.actor_email || "Someone";
    const isInvitationOutcome =
      n.type === "invitation_accepted" || n.type === "invitation_declined";
    // Workspace-scoped notifications have no task to open; they render a
    // workspace-name body instead of a task body.
    const isWorkspaceNotif =
      isInvitationOutcome || n.type === "ownership_transferred";

    return (
      <li key={n.id}>
        <button
          type="button"
          onClick={() => handleClick(n)}
          className={`w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-neutral-800/50 flex items-start gap-3 transition-colors ${
            isUnread ? "bg-blue-50/40" : ""
          } ${isWorkspaceNotif ? "cursor-default" : ""}`}
        >
          <div className="relative shrink-0">
            <Avatar
              displayName={n.actor_display_name}
              email={n.actor_email}
              avatarUrl={n.actor_avatar_url}
              color={n.actor_avatar_color}
              size={28}
            />
            <span className="absolute -bottom-0.5 -right-0.5">
              <NotificationTypeIcon type={n.type} />
            </span>
          </div>
          <div className="flex-1 min-w-0 pl-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs text-slate-600 dark:text-neutral-400 truncate">
                <span className="font-medium text-slate-900 dark:text-neutral-200">{actor}</span>{" "}
                <span className="text-slate-500 dark:text-neutral-400">
                  {notificationLabel(n.type).toLowerCase()}
                </span>
              </p>
              <span className="text-xs text-slate-400 dark:text-neutral-500 shrink-0">
                {timeAgo(n.created_at)}
              </span>
            </div>
            {isWorkspaceNotif
              ? renderWorkspaceBody(n)
              : renderTaskBody(n)}
          </div>
          {isUnread && (
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
          )}
        </button>
      </li>
    );
  }

  function renderTaskBody(n: Notification) {
    const identifier = (n.payload["identifier"] as string) ?? "Task";
    const title = (n.payload["title"] as string) ?? "";
    const preview = (n.payload["preview"] as string) ?? "";
    return (
      <>
        <p className="mt-0.5 text-sm text-slate-900 dark:text-neutral-200 truncate">
          <span className="text-xs text-slate-500 dark:text-neutral-400">{identifier}</span>
          {title && <span className="ml-1.5 text-slate-800 dark:text-neutral-200">— {title}</span>}
        </p>
        {preview && (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-neutral-400 line-clamp-2">
            {preview}
          </p>
        )}
      </>
    );
  }

  function renderWorkspaceBody(n: Notification) {
    const wsName = (n.payload["workspace_name"] as string) ?? "your workspace";
    const verb =
      n.type === "invitation_accepted"
        ? "Joined"
        : n.type === "invitation_declined"
          ? "Declined invite to"
          : "Now the owner of";
    return (
      <p className="mt-0.5 text-sm text-slate-800 dark:text-neutral-200 truncate">
        {verb} <span className="font-medium text-slate-900 dark:text-neutral-200">{wsName}</span>
      </p>
    );
  }

  return createPortal(
    <div
      ref={ref}
      style={{ position: "fixed", left, top, width: POPOVER_WIDTH }}
      className="z-50 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xl flex flex-col max-h-[80vh] overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-neutral-800">
        <div className="flex items-baseline gap-2">
          <h3 className="text-base font-semibold text-slate-900 dark:text-neutral-200">Inbox</h3>
          {(unread.length > 0 || invitations.length > 0) && (
            <span className="text-xs font-medium text-blue-600">
              {unread.length + invitations.length} unread
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-neutral-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
              className="rounded border-slate-300 dark:border-neutral-700"
            />
            <span>Unread only</span>
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Pending workspace invitations always show at the top — they're */}
        {/* time-sensitive and the user might be reachable in any view. */}
        {invitations.length > 0 && (
          <div>
            <div className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-600">
              Workspace invitations
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-neutral-800">
              {invitations.map((inv) => {
                const inviter =
                  inv.invited_by_display_name ??
                  inv.invited_by_email ??
                  "Someone";
                const accepting =
                  acceptInvitation.isPending &&
                  acceptInvitation.variables === inv.id;
                const declining =
                  declineInvitation.isPending &&
                  declineInvitation.variables === inv.id;
                const busy = accepting || declining;
                return (
                  <li key={inv.id} className="px-4 py-3 bg-amber-50/40">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.7}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="w-4 h-4"
                        >
                          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M19 8v6M16 11h6" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-800 dark:text-neutral-200 leading-snug">
                          <span className="font-semibold text-slate-900 dark:text-neutral-200">
                            {inviter}
                          </span>{" "}
                          invited you to{" "}
                          <span className="font-semibold text-slate-900 dark:text-neutral-200">
                            {inv.workspace_name ?? "a workspace"}
                          </span>{" "}
                          as <span className="font-medium">{inv.role}</span>
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <Button
                            size="sm"
                            className="h-7 px-3"
                            disabled={busy}
                            onClick={() =>
                              handleAcceptInvite(
                                inv.id,
                                inv.workspace_name,
                                inv.workspace_slug,
                              )
                            }
                          >
                            {accepting ? "Joining…" : "Accept"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-3"
                            disabled={busy}
                            onClick={() => handleDeclineInvite(inv.id)}
                          >
                            Decline
                          </Button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {isLoading ? (
          <p className="px-4 py-12 text-sm text-slate-400 dark:text-neutral-500 text-center">
            Loading…
          </p>
        ) : totalCount === 0 && invitations.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <div className="mx-auto w-10 h-10 rounded-full bg-slate-100 dark:bg-neutral-800 flex items-center justify-center mb-3 text-slate-400 dark:text-neutral-500">
              <BellIcon />
            </div>
            <p className="text-sm text-slate-500 dark:text-neutral-400">
              {unreadOnly ? "No unread notifications." : "You're all caught up."}
            </p>
            <p className="text-xs text-slate-400 dark:text-neutral-500 mt-1">
              New activity on your tasks will appear here.
            </p>
          </div>
        ) : (
          <>
            {unread.length > 0 && (
              <div>
                <div className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">
                  Unread
                </div>
                <ul className="divide-y divide-slate-100 dark:divide-neutral-800">
                  {unread.map(renderRow)}
                </ul>
              </div>
            )}
            {earlier.length > 0 && !unreadOnly && (
              <div>
                <div className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">
                  Earlier
                </div>
                <ul className="divide-y divide-slate-100 dark:divide-neutral-800">
                  {earlier.map(renderRow)}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {totalCount > 0 && (
        <div className="border-t border-slate-100 dark:border-neutral-800 px-3 py-2 flex items-center justify-between">
          <span className="text-xs text-slate-400 dark:text-neutral-500 px-1">
            {totalCount} notification{totalCount === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={markAllRead.isPending || unread.length === 0}
            className="text-xs text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-100 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {markAllRead.isPending ? "Marking…" : "Mark all read"}
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}

export function WorkspaceLayout() {
  const { wsSlug } = useParams();
  // Scroll the main pane back to the top when the workspace changes —
  // otherwise switching from (say) the Plan section at the bottom lands
  // you mid-page in the new workspace, which reads as disorienting.
  // (Effect lives below, after onSettingsPage is computed.)
  const mainRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  // Swap the global SidebarNav for SettingsSidebar on settings/profile
  // pages — same frame and tokens, different content (Account / Workspaces
  // / Projects). The flag also flips the top-left workspace-name button
  // from "switch workspace" dropdown into a "back to workspace" link.
  const onSettingsPage =
    location.pathname === `/w/${wsSlug}/settings` ||
    location.pathname === `/w/${wsSlug}/profile` ||
    location.pathname === `/w/${wsSlug}/billing` ||
    /^\/w\/[^/]+\/p\/[^/]+\/settings$/.test(location.pathname);

  // Scroll main to top on workspace switch (wsSlug) AND when moving between
  // settings sub-pages (Workspace ↔ Profile ↔ Project Settings) — those keep
  // the same wsSlug so only the pathname changes. Non-settings nav
  // (board/list/dashboard) keeps its scroll position (key stays "").
  const settingsScrollKey = onSettingsPage ? location.pathname : "";
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [wsSlug, settingsScrollKey]);
  const { data: workspaces = [] } = useWorkspaces();
  const { data: me } = useCurrentUser();

  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const { data: unreadNotifications = [] } = useNotifications({ unreadOnly: true });
  // Pending workspace invitations count toward the bell badge — the user
  // should see them no matter which page they're on.
  const { data: pendingInvitations = [] } = useMyInvitations();
  const unreadCount = unreadNotifications.length + pendingInvitations.length;
  const { toggle: togglePalette } = useCommandPaletteStore();

  const [wsMenuOpen, setWsMenuOpen] = useState(false);
  const [newWsModalOpen, setNewWsModalOpen] = useState(false);

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxTriggerRect, setInboxTriggerRect] = useState<DOMRect | null>(null);
  const inboxTriggerRef = useRef<HTMLButtonElement>(null);
  const [notifTaskId, setNotifTaskId] = useState<string | null>(null);
  const wsMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // Sidebar collapse state — persisted so refreshes / new tabs respect the
  // user's preference. Reads synchronously from localStorage on first paint
  // (lazy init) to avoid a one-frame expanded flash for users who keep it
  // collapsed.
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  });
  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  useNotificationsRealtime(me?.id);

  useEffect(() => {
    if (wsSlug) localStorage.setItem(LAST_WORKSPACE_KEY, wsSlug);
  }, [wsSlug]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        togglePalette();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePalette]);

  useEffect(() => {
    if (workspaces.length > 0 && !currentWs) {
      navigate("/", { replace: true });
    }
  }, [workspaces, currentWs, navigate]);

  // Close menus on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wsMenuRef.current && !wsMenuRef.current.contains(e.target as Node)) {
        setWsMenuOpen(false);
      }
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) toast.error(error.message);
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-neutral-800/40 overflow-hidden">
      <header className="border-b border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
        {/* Header: asymmetric padding so the avatar can sit visibly flush
            against the right edge while the workspace switcher keeps its
            comfortable left margin. py-1.5 + smaller circular buttons
            (w-8) trim the header to ~46px tall. */}
        <div className="pl-6 pr-3 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Brand logo — clickable, jumps to /w/<current>/ as a quick
                "back home" affordance. Mirrors how GitHub's octocat works. */}
            <button
              type="button"
              onClick={() => navigate(`/w/${wsSlug}`)}
              className="shrink-0"
              title="Home"
            >
              <img
                src="/logo.svg"
                alt="Trackly"
                className="w-7 h-7 dark:invert dark:hue-rotate-180"
              />
            </button>
            {/* Workspace switcher — on settings/profile pages, the workspace
                name acts as a "back to workspace" link instead of opening the
                dropdown (the user is intentionally out of the workspace flow). */}
            <div className="relative" ref={wsMenuRef}>
              <button
                type="button"
                onClick={() => {
                  if (onSettingsPage) {
                    navigate(`/w/${wsSlug}`);
                  } else {
                    setWsMenuOpen((v) => !v);
                  }
                }}
                className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-neutral-200 hover:text-slate-700 dark:hover:text-neutral-300"
                title={onSettingsPage ? `Back to ${currentWs?.name}` : "Switch workspace"}
              >
                {currentWs?.name ?? "Trackly"}
                {currentWs?.plan === "pro" && <ProBadge />}
                {!onSettingsPage && <span className="text-slate-400 dark:text-neutral-500 text-xs">▾</span>}
                {onSettingsPage && <span className="text-slate-400 dark:text-neutral-500 text-xs">↩</span>}
              </button>
              {!onSettingsPage && wsMenuOpen && (
                <div className="absolute left-0 top-full mt-1 w-56 rounded-md border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-lg z-20 py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setWsMenuOpen(false);
                      navigate(`/w/${wsSlug}/settings`);
                    }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-neutral-800/50 flex items-center gap-2"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-4 h-4 text-slate-500 dark:text-neutral-400"
                    >
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                    </svg>
                    <span>Workspace Settings</span>
                  </button>

                  <div className="border-t border-slate-100 dark:border-neutral-800 mt-1 pt-1">
                    <div className="px-3 py-1 text-xs uppercase text-slate-400 dark:text-neutral-500">
                      Switch workspace
                    </div>
                    {workspaces.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => {
                          setWsMenuOpen(false);
                          navigate(`/w/${w.slug}`);
                        }}
                        className={
                          w.id === currentWs?.id
                            ? "w-full text-left px-3 py-1.5 text-sm bg-slate-50 dark:bg-neutral-800/40 font-medium flex items-center justify-between gap-2"
                            : "w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-neutral-800/50 flex items-center justify-between gap-2"
                        }
                      >
                        <div className="flex items-baseline gap-2 min-w-0">
                          <span className="truncate">{w.name}</span>
                          <span className="shrink-0 font-mono text-xs text-slate-400 dark:text-neutral-500">
                            {w.slug}
                          </span>
                          {w.plan === "pro" && (
                            <span
                              className="shrink-0 text-sm leading-none text-[#C9A227] dark:text-[#E8C766]"
                              title="Pro"
                              aria-label="Pro plan"
                            >
                              ✦
                            </span>
                          )}
                        </div>
                        {w.id === currentWs?.id && (
                          <span className="shrink-0 text-slate-400 dark:text-neutral-500 text-xs">✓</span>
                        )}
                      </button>
                    ))}
                  </div>

                  <div className="border-t border-slate-100 dark:border-neutral-800 mt-1 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setWsMenuOpen(false);
                        setNewWsModalOpen(true);
                      }}
                      className="w-full text-left px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50"
                    >
                      + New workspace
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>

          <div className="flex items-center gap-1.5">
            {/* Pill-shaped search trigger. Borderless to match the lighter
                feel of the rest of the right cluster — subtle slate fill
                + hover only, like Supabase / Linear header search. */}
            <button
              type="button"
              onClick={togglePalette}
              className="inline-flex items-center gap-2 rounded-full bg-slate-100 dark:bg-neutral-800 px-3.5 py-1.5 text-xs text-slate-500 dark:text-neutral-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:text-neutral-300 transition-colors"
              title="Search (⌘K)"
            >
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-3.5 h-3.5 text-slate-400 dark:text-neutral-500"
                aria-hidden
              >
                <circle cx="9" cy="9" r="6" />
                <path d="m18 18-4.5-4.5" />
              </svg>
              <span>Search…</span>
              <kbd className="ml-1 rounded bg-white dark:bg-neutral-900 px-1 border border-slate-200 dark:border-neutral-800 text-slate-600 dark:text-neutral-400">
                ⌘K
              </kbd>
            </button>

            {/* Bell: borderless circle, subtle background only on hover /
                when open. Pairs visually with the borderless search pill. */}
            <button
              ref={inboxTriggerRef}
              type="button"
              onClick={() => {
                if (inboxTriggerRef.current) {
                  setInboxTriggerRect(
                    inboxTriggerRef.current.getBoundingClientRect(),
                  );
                }
                setInboxOpen((v) => !v);
              }}
              className={`relative inline-flex items-center justify-center rounded-full w-8 h-8 text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800 hover:text-slate-900 dark:hover:text-neutral-100 transition-colors ${
                inboxOpen ? "bg-slate-100 dark:bg-neutral-800 text-slate-900 dark:text-neutral-200" : ""
              }`}
              title="Inbox"
              aria-label="Inbox"
            >
              <BellIcon filled={unreadCount > 0} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 rounded-full bg-blue-500 min-w-[18px] h-[18px] inline-flex items-center justify-center px-1 text-[10px] font-semibold text-white leading-none ring-2 ring-white dark:ring-neutral-900">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {/* Profile: bare avatar, no surrounding ring. The Avatar
                component itself provides the colored circle (or photo), so
                a second border around it just adds visual noise. Sits
                tight against the bell — Supabase-style packed right
                cluster. */}
            <div className="relative" ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => setProfileMenuOpen((v) => !v)}
                className="rounded-full hover:opacity-80 transition-opacity"
                title={me?.display_name ?? me?.email ?? "Account menu"}
              >
                <Avatar
                  displayName={me?.display_name ?? null}
                  email={me?.email ?? null}
                  avatarUrl={me?.avatar_url ?? null}
                  color={me?.avatar_color ?? null}
                  size={32}
                  className="ring-0"
                />
              </button>
              {profileMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-64 rounded-lg border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg z-20 overflow-hidden">
                  {/* Identity card — avatar + name + email. When the user
                      hasn't set a display_name, the email takes the
                      primary slot so the card still anchors a name. */}
                  <div className="flex items-center gap-3 px-3 py-3 border-b border-slate-100 dark:border-neutral-800">
                    <Avatar
                      displayName={me?.display_name ?? null}
                      email={me?.email ?? null}
                      avatarUrl={me?.avatar_url ?? null}
                      color={me?.avatar_color ?? null}
                      size={36}
                      className="ring-0"
                    />
                    <div className="min-w-0 flex-1">
                      {me?.display_name ? (
                        <>
                          <p className="text-sm font-semibold text-slate-900 dark:text-neutral-200 truncate">
                            {me.display_name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-neutral-400 truncate">
                            {me?.email}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm font-semibold text-slate-900 dark:text-neutral-200 truncate">
                          {me?.email}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Single Settings entry — lands on Profile Settings;
                      from there, SettingsSidebar lets the user pick
                      Workspace / Project settings without leaving the
                      settings space. Replaces three menu items (Profile /
                      Workspace / Project Settings) that did the same job
                      with more chrome. */}
                  <div className="py-1">
                    {/* Quick access: Billing is its own page; Features
                        deep-links into the Workspace Settings section. */}
                    <ProfileMenuItem
                      onClick={() => {
                        setProfileMenuOpen(false);
                        navigate(`/w/${wsSlug}/billing`);
                      }}
                      icon={<CreditCard className="w-4 h-4" strokeWidth={1.7} />}
                    >
                      Billing
                    </ProfileMenuItem>
                    <ProfileMenuItem
                      onClick={() => {
                        setProfileMenuOpen(false);
                        navigate(`/w/${wsSlug}/settings#ws-features`);
                      }}
                      icon={<SlidersHorizontal className="w-4 h-4" strokeWidth={1.7} />}
                    >
                      Features
                    </ProfileMenuItem>
                    <ProfileMenuItem
                      onClick={() => {
                        setProfileMenuOpen(false);
                        navigate(`/w/${wsSlug}/profile`);
                      }}
                      icon={
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.7}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="w-4 h-4"
                        >
                          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      }
                    >
                      Settings
                    </ProfileMenuItem>
                  </div>

                  {/* Theme switcher — Supabase-style 3-segment control.
                      Sits between settings and sign-out so the destructive
                      action stays at the bottom. */}
                  <div className="border-t border-slate-100 dark:border-neutral-800">
                    <ThemeSwitch />
                  </div>

                  {/* Destructive group, visually separated */}
                  <div className="border-t border-slate-100 dark:border-neutral-800 py-1">
                    <ProfileMenuItem
                      onClick={() => {
                        setProfileMenuOpen(false);
                        signOut();
                      }}
                      icon={
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.7}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="w-4 h-4"
                        >
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                          <polyline points="16 17 21 12 16 7" />
                          <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                      }
                    >
                      Sign out
                    </ProfileMenuItem>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <SectionSidebarProvider>
        {/* `relative` is the positioning context for the absolute
            SectionSidebar overlay below — letting it float over <main>
            without pushing it right. */}
        <div className="flex flex-1 min-h-0 relative">
          {onSettingsPage ? (
            <SettingsSidebar
              collapsed={sidebarCollapsed}
              onToggle={() => setSidebarCollapsed((v) => !v)}
            />
          ) : (
            <SidebarNav
              wsSlug={wsSlug ?? ""}
              currentWsId={currentWs?.id ?? ""}
              goalsEnabled={!!currentWs?.features?.goals}
              collapsed={sidebarCollapsed}
              onToggle={() => setSidebarCollapsed((v) => !v)}
            />
          )}

          {/* Tier-2 sub-rail. Absolutely positioned (NOT a flex item)
              so it overlays the left edge of <main> instead of shifting
              it right. Renders only when the current page has registered
              in-page sections via useSectionSidebar. */}
          <SectionSidebar siblingCollapsed={sidebarCollapsed} />

          {/* Reserve a scrollbar gutter even when content fits. Without
              this, navigating between long pages (Workspace Settings with
              many members) and shorter ones (a different workspace with
              fewer) shows / hides a vertical scrollbar inside <main>,
              shifting the inner mx-auto-centered content horizontally by
              ~15px. */}
          <main ref={mainRef} className="flex-1 px-8 pt-5 pb-8 overflow-y-auto overflow-x-hidden bg-white dark:bg-neutral-950 text-slate-900 dark:text-neutral-200 [scrollbar-gutter:stable]">
            <Outlet />
          </main>
        </div>
      </SectionSidebarProvider>

      {newWsModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => setNewWsModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-lg bg-white dark:bg-neutral-900 shadow-xl p-5 space-y-4"
          >
            <h2 className="text-lg font-semibold text-slate-900 dark:text-neutral-200">New workspace</h2>
            <CreateWorkspaceForm
              autoFocus
              onCancel={() => setNewWsModalOpen(false)}
              onCreated={(ws) => {
                setNewWsModalOpen(false);
                navigate(`/w/${ws.slug}`);
              }}
            />
          </div>
        </div>
      )}

      <CommandPalette />

      <InboxPopover
        open={inboxOpen}
        onClose={() => setInboxOpen(false)}
        onOpenTask={(id) => setNotifTaskId(id)}
        triggerRect={inboxTriggerRect}
      />
      <TaskDetailModal
        taskId={notifTaskId}
        onClose={() => setNotifTaskId(null)}
      />
    </div>
  );
}

function SidebarNav({
  wsSlug,
  currentWsId,
  goalsEnabled,
  collapsed: collapsedPinned,
  onToggle,
}: {
  wsSlug: string;
  currentWsId: string;
  // Workspace owners toggle Goals on/off in Workspace Settings → Features.
  // Hidden by default; the Goals page still exists at /w/:slug/goals for
  // users who type the URL directly (no aggressive route blocking).
  goalsEnabled: boolean;
  // When true, sidebar renders as a ~48px icons-only rail. Labels are
  // dropped from the DOM (cleaner than `hidden` because tooltips read
  // from `title=` on the parent button instead of the now-hidden span).
  collapsed: boolean;
  onToggle: () => void;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { pKey: activePKey } = useParams();
  const { data: projects = [] } = useProjects(currentWsId);
  const createMutation = useCreateProject(currentWsId);
  const { resolved: theme } = useTheme();
  const isDark = theme === "dark";

  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  // Key suggestion: derived from name unless the user types directly into
  // the key field. `keyTouched` makes the name→key auto-fill stop once
  // the user has expressed intent on the key.
  const [keyDraft, setKeyDraft] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);

  // First 4 alphanumeric chars of the name, uppercased — matches the
  // shape the backend's `_derive_base_key` falls back to when the
  // client doesn't send one. Keeping it client-side here lets us show
  // a live preview before the request fires.
  function deriveKey(n: string): string {
    return n.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  }
  // Sync key from name while the user hasn't touched the key field.
  useEffect(() => {
    if (!keyTouched) setKeyDraft(deriveKey(name));
  }, [name, keyTouched]);

  const keyValid =
    keyDraft.length >= 2 &&
    keyDraft.length <= 10 &&
    /^[A-Z][A-Z0-9]*$/.test(keyDraft);

  // Close modal on Esc
  useEffect(() => {
    if (!showModal) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowModal(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showModal]);

  function openModal() {
    setName("");
    setKeyDraft("");
    setKeyTouched(false);
    setShowModal(true);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!currentWsId) return;
    if (!name.trim()) return;
    if (!keyValid) {
      toast.error("Key must be 2–10 chars, uppercase letters and digits, starting with a letter.");
      return;
    }
    try {
      const p = await createMutation.mutateAsync({
        name: name.trim(),
        key: keyDraft,
      });
      toast.success(`Created ${p.name}`);
      setShowModal(false);
      setName("");
      setKeyDraft("");
      setKeyTouched(false);
      navigate(`/w/${wsSlug}/p/${p.key}/board`);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to create project";
      toast.error(detail);
    }
  }

  // Hover-to-peek: when the sidebar is pinned-collapsed, hovering the 48px
  // rail floats the full sidebar over the content (overlay, doesn't shift
  // <main>). `peek` is transient (never persisted). The derived `collapsed`
  // below means "render the icon rail" = pinned-collapsed AND not peeking, so
  // every downstream label/title/rail check stays keyed on one flag.
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef<number | null>(null);
  const openPeek = () => {
    if (peekTimer.current) window.clearTimeout(peekTimer.current);
    // small delay so brushing past the left edge doesn't pop it open
    peekTimer.current = window.setTimeout(() => setPeek(true), 120);
  };
  const closePeek = () => {
    if (peekTimer.current) {
      window.clearTimeout(peekTimer.current);
      peekTimer.current = null;
    }
    setPeek(false);
  };
  useEffect(
    () => () => {
      if (peekTimer.current) window.clearTimeout(peekTimer.current);
    },
    [],
  );
  const collapsed = collapsedPinned && !peek;
  const handleToggle = () => {
    closePeek();
    onToggle();
  };

  // Treat the URL as the source of truth for sidebar active state so each
  // primary entry highlights consistently as the user navigates.
  const onDashboard = pathname === `/w/${wsSlug}/dashboard`;
  const onGoals = pathname === `/w/${wsSlug}/goals`;
  const onMyTasks = pathname === `/w/${wsSlug}/my-issues`;

  // Primary nav items (Dashboard / My Tasks). Keep them visually lightweight
  // — a normal (non-bold) weight at the standard sidebar size reads cleaner
  // than the previous semibold treatment.
  // Collapsed-mode tweak: drop `gap-2.5` and use `justify-center` so the
  // icon sits centered in the 48px rail instead of left-padded against
  // an absent label.
  const itemBase = collapsed
    ? "group flex items-center justify-center w-full rounded-md py-1.5 text-sm transition-colors"
    : "group flex items-center gap-2.5 w-full text-left rounded-md px-2 py-1.5 text-sm font-normal tracking-tight transition-colors";
  const itemIdle = `${itemBase} text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-100 hover:bg-slate-100 dark:hover:bg-neutral-800`;
  const itemActive = `${itemBase} text-slate-900 dark:text-neutral-200 bg-slate-100 dark:bg-neutral-800 font-medium`;

  return (
    <>
      {/* When pinned-collapsed, reserve the 48px gutter in flow so <main>
          never shifts; the real <aside> floats over it as an overlay and
          widens to w-56 on hover (peek). */}
      {collapsedPinned && <div className="w-12 shrink-0" aria-hidden />}
      <aside
        onMouseEnter={collapsedPinned ? openPeek : undefined}
        onMouseLeave={collapsedPinned ? closePeek : undefined}
        className={`group/sidebar border-r border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-2 flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden transition-[width] duration-200 ease-out ${
          collapsedPinned
            ? `absolute left-0 inset-y-0 z-30 ${peek ? "w-56 shadow-xl" : "w-12"}`
            : "relative w-56 shrink-0"
        }`}
      >
      {/* Collapse / pin toggle — absolute top-right, fades in on hover
          (Linear / Notion pattern). Only when the rail is open: when pinned-
          collapsed there's no expand button — hovering the rail peeks it open
          and you pin from this button during the peek. Named group
          `group/sidebar` isolates this from the nav items' own `group-hover:`. */}
      {!collapsed && (
        <button
          type="button"
          onClick={handleToggle}
          className="absolute top-2 right-2 z-10 w-7 h-7 flex items-center justify-center rounded text-slate-400 dark:text-neutral-500 hover:text-slate-900 dark:hover:text-neutral-100 hover:bg-slate-100 dark:hover:bg-neutral-800 transition-opacity opacity-0 group-hover/sidebar:opacity-100 focus:opacity-100"
          // In peek (pinned-collapsed, floated open) the toggle pins it open;
          // when actually expanded it collapses.
          title={collapsedPinned ? "Pin sidebar open" : "Collapse sidebar"}
          aria-label={collapsedPinned ? "Pin sidebar open" : "Collapse sidebar"}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
          >
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <line x1="9" y1="4" x2="9" y2="20" />
            <path d={collapsedPinned ? "M13 9l3 3-3 3" : "M16 9l-3 3 3 3"} />
          </svg>
        </button>
      )}
      {/* Collapse toggle lives in the header (WorkspaceLayout) so it
          doesn't push the primary nav items down. */}
      <button
        type="button"
        className={onDashboard ? itemActive : itemIdle}
        onClick={() => navigate(`/w/${wsSlug}/dashboard`)}
        title={collapsed ? "Dashboard" : undefined}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`w-4 h-4 ${onDashboard ? "text-slate-700 dark:text-neutral-300" : "text-slate-400 dark:text-neutral-500 group-hover:text-slate-600"}`}
        >
          <path d="M4 19V9l8-5 8 5v10" />
          <path d="M9 19v-6h6v6" />
        </svg>
        {!collapsed && <span>Dashboard</span>}
      </button>
      {goalsEnabled && (
        <button
          type="button"
          className={onGoals ? itemActive : itemIdle}
          onClick={() => navigate(`/w/${wsSlug}/goals`)}
          title={collapsed ? "Goals" : undefined}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`w-4 h-4 ${onGoals ? "text-slate-700 dark:text-neutral-300" : "text-slate-400 dark:text-neutral-500 group-hover:text-slate-600"}`}
          >
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="5" />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          </svg>
          {!collapsed && <span>Goals</span>}
        </button>
      )}
      <button
        type="button"
        className={onMyTasks ? itemActive : itemIdle}
        onClick={() => navigate(`/w/${wsSlug}/my-issues`)}
        title={collapsed ? "My Tasks" : undefined}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`w-4 h-4 ${onMyTasks ? "text-slate-700 dark:text-neutral-300" : "text-slate-400 dark:text-neutral-500 group-hover:text-slate-600"}`}
        >
          <path d="M9 11l3 3 8-8" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
        {!collapsed && <span>My Tasks</span>}
      </button>

      {/* Projects header + "+" button: when collapsed, the section header
          disappears and "+" centers under the nav icons as the only
          new-project entry point. */}
      {collapsed ? (
        <button
          type="button"
          onClick={openModal}
          className="self-center text-slate-400 dark:text-neutral-500 hover:text-slate-900 dark:hover:text-neutral-100 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded w-7 h-7 flex items-center justify-center text-base leading-none mt-4 mb-1"
          title="New project"
          aria-label="New project"
        >
          +
        </button>
      ) : (
        <div className="flex items-center justify-between px-2 pt-5 pb-1.5">
          <span className="text-[10px] uppercase tracking-[0.12em] text-slate-400 dark:text-neutral-500 font-semibold">
            Projects
          </span>
          <button
            type="button"
            onClick={openModal}
            className="text-slate-400 dark:text-neutral-500 hover:text-slate-900 dark:hover:text-neutral-100 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded w-5 h-5 flex items-center justify-center text-base leading-none"
            title="New project"
            aria-label="New project"
          >
            +
          </button>
        </div>
      )}

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => setShowModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-lg bg-white dark:bg-neutral-900 shadow-xl p-5 space-y-4"
          >
            <h2 className="text-lg font-semibold text-slate-900 dark:text-neutral-200">New project</h2>
            <form onSubmit={onCreate} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="modal-proj-name">Name</Label>
                <Input
                  id="modal-proj-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={1}
                  maxLength={100}
                  placeholder="Backend"
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="modal-proj-key">Key</Label>
                <Input
                  id="modal-proj-key"
                  value={keyDraft}
                  onChange={(e) => {
                    setKeyTouched(true);
                    // Force the same charset the backend enforces (and the
                    // identifier regex `^[A-Z][A-Z0-9]*$`) so the user can't
                    // type something the server will reject.
                    const v = e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, "")
                      .slice(0, 10);
                    setKeyDraft(v);
                  }}
                  minLength={2}
                  maxLength={10}
                  className="font-mono uppercase tracking-wider"
                />
                <p className="text-xs text-slate-500 dark:text-neutral-400 whitespace-nowrap overflow-hidden text-ellipsis">
                  Becomes{" "}
                  {[1, 2, 3].map((n) => (
                    <span key={n}>
                      <span className="font-mono text-slate-700 dark:text-neutral-300">
                        {(keyDraft || "KEY")}-{n}
                      </span>
                      {n < 3 ? ", " : " …"}
                    </span>
                  ))}{" "}
                  · 2–10 chars, A–Z 0–9
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    createMutation.isPending || !name.trim() || !keyValid
                  }
                >
                  {createMutation.isPending ? "Creating…" : "Create"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {projects.length === 0 && (
        <p className="px-2 text-xs text-slate-400 dark:text-neutral-500 italic">No projects yet</p>
      )}

      <div className="space-y-0.5">
        {projects.map((p) => {
          const isActive = p.key === activePKey;
          // User-set color when present; falls back to a hash-derived hue
          // so projects without an explicit color still look distinct.
          const dotColor = projectDotColor({
            key: p.key,
            color: p.color,
            dark: isDark,
          });
          return (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/w/${wsSlug}/p/${p.key}/board`)}
              onKeyDown={(e) => {
                if (e.key === "Enter") navigate(`/w/${wsSlug}/p/${p.key}/board`);
              }}
              title={collapsed ? p.name : undefined}
              className={
                collapsed
                  ? "group flex items-center justify-center rounded-md py-1.5 transition-colors cursor-pointer " +
                    (isActive
                      ? "bg-slate-100 dark:bg-neutral-800"
                      : "hover:bg-slate-100 dark:hover:bg-neutral-800")
                  : "group flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-normal tracking-tight transition-colors cursor-pointer " +
                    (isActive
                      ? "text-slate-900 dark:text-neutral-200 bg-slate-100 dark:bg-neutral-800 font-medium"
                      : "text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-100 hover:bg-slate-100 dark:hover:bg-neutral-800")
              }
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: dotColor }}
              />
              {!collapsed && (
                <div className="flex items-baseline gap-2 min-w-0 flex-1">
                  <span className="truncate min-w-0">{p.name}</span>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-slate-400 dark:text-neutral-500">
                    {p.key}
                  </span>
                </div>
              )}
              {!collapsed && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/w/${wsSlug}/p/${p.key}/settings`);
                }}
                className="opacity-0 group-hover:opacity-100 text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-100 hover:bg-slate-200 rounded p-0.5 transition-opacity"
                title={`${p.name} settings`}
                aria-label={`${p.name} settings`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-4 h-4"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                </svg>
              </button>
              )}
            </div>
          );
        })}
      </div>

      </aside>
    </>
  );
}
