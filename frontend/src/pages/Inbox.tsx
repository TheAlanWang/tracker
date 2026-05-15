import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  type Notification,
  useMarkAllRead,
  useMarkRead,
  useNotifications,
} from "@/features/notifications/api";

function notificationIcon(type: Notification["type"]): string {
  switch (type) {
    case "assigned":
      return "→";
    case "commented":
      return "💬";
    case "mentioned":
      return "@";
    case "status_changed":
      return "◎";
    default:
      return "•";
  }
}

function notificationLabel(type: Notification["type"]): string {
  switch (type) {
    case "assigned":
      return "assigned to you";
    case "commented":
      return "new comment";
    case "mentioned":
      return "mentioned you";
    case "status_changed":
      return "status changed";
    default:
      return type;
  }
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

export default function Inbox() {
  const { wsSlug } = useParams();
  const navigate = useNavigate();
  const [unreadOnly, setUnreadOnly] = useState(false);

  const { data: notifications = [], isLoading } = useNotifications({
    unreadOnly,
  });
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  async function handleClickNotification(n: Notification) {
    if (!n.read_at) {
      try {
        await markRead.mutateAsync(n.id);
      } catch {
        // Non-blocking — still navigate
      }
    }
    const identifier = n.payload["identifier"] as string | undefined;
    if (identifier) {
      // identifier format: "KEY-N" — need project key
      const projectKey = identifier.split("-")[0];
      navigate(`/w/${wsSlug}/p/${projectKey}/tasks/${identifier}`);
    }
  }

  async function handleMarkAllRead() {
    try {
      const result = await markAllRead.mutateAsync();
      toast.success(`Marked ${result.count} notification(s) as read`);
    } catch {
      toast.error("Failed to mark all as read");
    }
  }

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900">Inbox</h1>
          {unreadCount > 0 && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
              {unreadCount} unread
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              className="rounded"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
            />
            Unread only
          </label>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={markAllRead.isPending}
            >
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {!isLoading && notifications.length === 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {unreadOnly ? "No unread notifications." : "No notifications yet."}
          </p>
        </div>
      )}

      <ul className="space-y-1">
        {notifications.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => handleClickNotification(n)}
              className={`w-full text-left rounded-lg border px-4 py-3 transition-colors hover:bg-slate-50 ${
                n.read_at
                  ? "border-slate-200 bg-white"
                  : "border-blue-200 bg-blue-50"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="mt-0.5 text-base shrink-0" aria-hidden>
                    {notificationIcon(n.type)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {(n.payload["identifier"] as string) ?? "Issue"}{" "}
                      <span className="font-normal text-slate-600">
                        — {n.payload["title"] as string ?? ""}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {notificationLabel(n.type)}
                      {n.actor_id && (
                        <span className="ml-1">
                          by{" "}
                          <span className="font-mono text-slate-500">
                            {n.actor_id.slice(0, 8)}…
                          </span>
                        </span>
                      )}
                    </p>
                    {n.payload["preview"] && (
                      <p className="mt-1 text-xs text-slate-500 truncate">
                        {n.payload["preview"] as string}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!n.read_at && (
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                  )}
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {timeAgo(n.created_at)}
                  </span>
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
