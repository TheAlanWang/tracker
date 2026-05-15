import { Outlet, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useEffect } from "react";

import { CommandPalette } from "@/components/CommandPalette";
import { useNotifications } from "@/features/notifications/api";
import { useNotificationsRealtime } from "@/features/realtime/useNotificationsRealtime";
import { useWorkspaces } from "@/features/workspaces/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useCommandPaletteStore } from "@/lib/commandPaletteStore";
import { supabase } from "@/lib/supabase";

const LAST_WORKSPACE_KEY = "tracker.lastWorkspaceSlug";

export function WorkspaceLayout() {
  const { wsSlug } = useParams();
  const navigate = useNavigate();
  const { data: workspaces = [] } = useWorkspaces();
  const { data: me } = useCurrentUser();

  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const { data: unreadNotifications = [] } = useNotifications({ unreadOnly: true });
  const unreadCount = unreadNotifications.length;
  const { toggle: togglePalette } = useCommandPaletteStore();

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

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) toast.error(error.message);
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => navigate(`/w/${wsSlug}`)}
              className="font-semibold text-slate-900 hover:text-slate-700"
            >
              {currentWs?.name ?? "tracker"}
            </button>
            <button
              type="button"
              onClick={togglePalette}
              className="rounded border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500 hover:bg-slate-100"
              title="Search (⌘K)"
            >
              Search…  <kbd className="ml-1 rounded bg-white px-1 border border-slate-200 text-slate-600">⌘K</kbd>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(`/w/${wsSlug}/inbox`)}
              className="relative rounded px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              Inbox
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 rounded-full bg-blue-500 px-1.5 py-0.5 text-xs font-medium text-white leading-none">
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => navigate("/settings/profile")}
              className="flex items-center gap-2 rounded px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
              title="Profile settings"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-xs font-medium text-slate-700">
                {(me?.display_name ?? me?.email ?? "?").slice(0, 1).toUpperCase()}
              </span>
              <span className="text-xs text-slate-600 hidden sm:inline">
                {me?.display_name ?? me?.email}
              </span>
            </button>
            <button
              type="button"
              onClick={signOut}
              className="text-xs text-slate-500 hover:text-slate-700 px-2"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="w-56 border-r border-slate-200 bg-white p-4 flex flex-col">
          <div className="flex flex-col">
            <span className="text-xs uppercase text-muted-foreground">
              Workspace
            </span>
            <span className="font-medium text-slate-900">
              {currentWs?.name ?? "…"}
            </span>
          </div>
          <hr className="my-4" />
          <nav className="flex-1 space-y-1 text-sm">
            <button
              type="button"
              className="block w-full text-left rounded px-2 py-1 hover:bg-slate-100"
              onClick={() => navigate("/dashboard")}
            >
              Dashboard
            </button>
            <button
              type="button"
              className="block w-full text-left rounded px-2 py-1 hover:bg-slate-100"
              onClick={() => navigate(`/w/${wsSlug}`)}
            >
              Projects
            </button>
            <button
              type="button"
              className="block w-full text-left rounded px-2 py-1 hover:bg-slate-100"
              onClick={() => navigate(`/w/${wsSlug}/my-issues`)}
            >
              My issues
            </button>
            <button
              type="button"
              className="block w-full text-left rounded px-2 py-1 hover:bg-slate-100"
              onClick={() => navigate(`/w/${wsSlug}/settings`)}
            >
              Settings
            </button>
          </nav>
        </aside>

        <main className="flex-1 p-8 overflow-auto">
          <Outlet />
        </main>
      </div>

      <CommandPalette />
    </div>
  );
}
