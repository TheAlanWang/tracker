import { Outlet, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
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
      // The slug in the URL doesn't match any workspace; bounce to home.
      navigate("/", { replace: true });
    }
  }, [workspaces, currentWs, navigate]);

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) toast.error(error.message);
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="w-60 border-r border-slate-200 bg-white p-4 flex flex-col">
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
            className="flex w-full items-center justify-between rounded px-2 py-1 hover:bg-slate-100"
            onClick={() => navigate(`/w/${wsSlug}/inbox`)}
          >
            <span>Inbox</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-blue-500 px-1.5 py-0.5 text-xs font-medium text-white leading-none">
                {unreadCount}
              </span>
            )}
          </button>
          <button
            type="button"
            className="block w-full text-left rounded px-2 py-1 hover:bg-slate-100"
            onClick={() => navigate(`/w/${wsSlug}/settings`)}
          >
            Settings
          </button>
        </nav>
        <hr className="my-4" />
        <div className="text-xs text-muted-foreground space-y-1">
          <div>{me?.email}</div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={signOut}
          >
            Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-8">
        <Outlet />
      </main>
      <CommandPalette />
    </div>
  );
}
