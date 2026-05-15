import { Outlet, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { CommandPalette } from "@/components/CommandPalette";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNotifications } from "@/features/notifications/api";
import {
  useCreateProject,
  useDeleteProject,
  useProjects,
} from "@/features/projects/api";
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

  const [wsMenuOpen, setWsMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const wsMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

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
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Workspace switcher */}
            <div className="relative" ref={wsMenuRef}>
              <button
                type="button"
                onClick={() => setWsMenuOpen((v) => !v)}
                className="flex items-center gap-1 font-semibold text-slate-900 hover:text-slate-700"
              >
                {currentWs?.name ?? "tracker"}
                <span className="text-slate-400 text-xs">▾</span>
              </button>
              {wsMenuOpen && (
                <div className="absolute left-0 top-full mt-1 w-56 rounded-md border border-slate-200 bg-white shadow-lg z-20 py-1">
                  <div className="px-3 py-1 text-xs uppercase text-slate-400">
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
                          ? "w-full text-left px-3 py-1.5 text-sm bg-slate-50 font-medium"
                          : "w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50"
                      }
                    >
                      {w.name}
                    </button>
                  ))}
                  <div className="border-t border-slate-100 mt-1 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setWsMenuOpen(false);
                        navigate("/onboarding");
                      }}
                      className="w-full text-left px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50"
                    >
                      + New workspace
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={togglePalette}
              className="rounded border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500 hover:bg-slate-100"
              title="Search (⌘K)"
            >
              Search…
              <kbd className="ml-1 rounded bg-white px-1 border border-slate-200 text-slate-600">⌘K</kbd>
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

            {/* Profile dropdown */}
            <div className="relative" ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => setProfileMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
                title="Account menu"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-xs font-medium text-slate-700">
                  {(me?.display_name ?? me?.email ?? "?").slice(0, 1).toUpperCase()}
                </span>
                <span className="text-xs text-slate-600 hidden sm:inline">
                  {me?.display_name ?? me?.email}
                </span>
                <span className="text-slate-400 text-xs">▾</span>
              </button>
              {profileMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 rounded-md border border-slate-200 bg-white shadow-lg z-20 py-1">
                  <div className="px-3 py-1.5 text-xs text-slate-500 border-b border-slate-100 mb-1 truncate">
                    {me?.email}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      navigate("/settings/profile");
                    }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50"
                  >
                    Profile settings
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      signOut();
                    }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 text-red-600"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <SidebarNav wsSlug={wsSlug ?? ""} currentWsId={currentWs?.id ?? ""} />

        <main className="flex-1 p-8 overflow-auto">
          <Outlet />
        </main>
      </div>

      <CommandPalette />
    </div>
  );
}

function SidebarNav({ wsSlug, currentWsId }: { wsSlug: string; currentWsId: string }) {
  const navigate = useNavigate();
  const { pKey: activePKey } = useParams();
  const { data: projects = [] } = useProjects(currentWsId);
  const createMutation = useCreateProject(currentWsId);
  const deleteMutation = useDeleteProject(currentWsId);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!currentWsId) return;
    try {
      const p = await createMutation.mutateAsync({ name, key: key.toUpperCase() });
      toast.success(`Created ${p.name}`);
      setShowForm(false);
      setName("");
      setKey("");
      navigate(`/w/${wsSlug}/p/${p.key}/board`);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to create project";
      toast.error(detail);
    }
  }

  async function onDelete(e: React.MouseEvent, projectId: string, projectName: string) {
    e.stopPropagation();
    if (!confirm(`Delete project "${projectName}"? Deletes all its issues and sprints.`)) return;
    try {
      await deleteMutation.mutateAsync(projectId);
      toast.success(`Deleted ${projectName}`);
      // If the deleted project was active, bounce to workspace home
      navigate(`/w/${wsSlug}`);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to delete project";
      toast.error(detail);
    }
  }

  return (
    <aside className="w-56 border-r border-slate-200 bg-white p-4 flex flex-col gap-1 text-sm overflow-y-auto">
      <button
        type="button"
        className="block w-full text-left rounded px-2 py-1 hover:bg-slate-100"
        onClick={() => navigate(`/w/${wsSlug}/dashboard`)}
      >
        Dashboard
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

      <hr className="my-3" />

      <div className="flex items-center justify-between px-2 pb-1">
        <span className="text-xs uppercase text-slate-400 font-medium">Projects</span>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="text-slate-500 hover:text-slate-900 text-base leading-none"
          title="New project"
        >
          {showForm ? "−" : "+"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={onCreate} className="space-y-2 px-2 pb-2">
          <div className="space-y-1">
            <Label htmlFor="sidebar-proj-name" className="text-xs">Name</Label>
            <Input
              id="sidebar-proj-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={1}
              maxLength={100}
              placeholder="Backend"
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sidebar-proj-key" className="text-xs">Key</Label>
            <Input
              id="sidebar-proj-key"
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase())}
              required
              minLength={2}
              maxLength={10}
              pattern="[A-Z][A-Z0-9]*"
              placeholder="BE"
              className="h-7 text-xs font-mono"
            />
          </div>
          <Button type="submit" size="sm" className="w-full" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating…" : "Create"}
          </Button>
        </form>
      )}

      {projects.length === 0 && !showForm && (
        <p className="px-2 text-xs text-slate-400 italic">No projects yet</p>
      )}

      <div className="space-y-0.5">
        {projects.map((p) => {
          const isActive = p.key === activePKey;
          return (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/w/${wsSlug}/p/${p.key}/board`)}
              onKeyDown={(e) => {
                if (e.key === "Enter") navigate(`/w/${wsSlug}/p/${p.key}/board`);
              }}
              className={
                isActive
                  ? "group flex items-center justify-between rounded px-2 py-1 bg-slate-100 cursor-pointer"
                  : "group flex items-center justify-between rounded px-2 py-1 hover:bg-slate-100 cursor-pointer"
              }
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-xs text-slate-500 shrink-0">{p.key}</span>
                <span className="truncate">{p.name}</span>
              </div>
              <button
                type="button"
                onClick={(e) => onDelete(e, p.id, p.name)}
                className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 text-sm leading-none px-1"
                title={`Delete ${p.name}`}
                disabled={deleteMutation.isPending}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
