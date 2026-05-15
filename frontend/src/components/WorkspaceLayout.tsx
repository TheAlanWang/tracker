import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
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
import {
  useCreateWorkspace,
  useWorkspaces,
} from "@/features/workspaces/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useCommandPaletteStore } from "@/lib/commandPaletteStore";
import { supabase } from "@/lib/supabase";

const LAST_WORKSPACE_KEY = "tracker.lastWorkspaceSlug";

function slugifyWorkspace(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export function WorkspaceLayout() {
  const { wsSlug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // Hide the left sidebar on workspace-level settings — page is self-contained
  // (has its own workspace picker) and doesn't relate to project navigation.
  const hideSidebar =
    location.pathname === `/w/${wsSlug}/settings` ||
    location.pathname === `/w/${wsSlug}/profile`;
  const { data: workspaces = [] } = useWorkspaces();
  const { data: me } = useCurrentUser();

  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const { data: unreadNotifications = [] } = useNotifications({ unreadOnly: true });
  const unreadCount = unreadNotifications.length;
  const { toggle: togglePalette } = useCommandPaletteStore();

  const [wsMenuOpen, setWsMenuOpen] = useState(false);
  const [newWsModalOpen, setNewWsModalOpen] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const createWsMutation = useCreateWorkspace();

  async function onCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    const slug = slugifyWorkspace(newWsName);
    if (slug.length < 2) {
      toast.error("Workspace name needs at least 2 letters");
      return;
    }
    try {
      const ws = await createWsMutation.mutateAsync({ name: newWsName, slug });
      toast.success(`Created ${ws.name}`);
      setNewWsModalOpen(false);
      setNewWsName("");
      navigate(`/w/${ws.slug}`);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to create workspace";
      toast.error(detail);
    }
  }

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
            {/* Workspace switcher — on settings/profile pages, the workspace
                name acts as a "back to workspace" link instead of opening the
                dropdown (the user is intentionally out of the workspace flow). */}
            <div className="relative" ref={wsMenuRef}>
              <button
                type="button"
                onClick={() => {
                  if (hideSidebar) {
                    navigate(`/w/${wsSlug}`);
                  } else {
                    setWsMenuOpen((v) => !v);
                  }
                }}
                className="flex items-center gap-1 font-semibold text-slate-900 hover:text-slate-700"
                title={hideSidebar ? `Back to ${currentWs?.name}` : "Switch workspace"}
              >
                {currentWs?.name ?? "tracker"}
                {!hideSidebar && <span className="text-slate-400 text-xs">▾</span>}
                {hideSidebar && <span className="text-slate-400 text-xs">↩</span>}
              </button>
              {!hideSidebar && wsMenuOpen && (
                <div className="absolute left-0 top-full mt-1 w-56 rounded-md border border-slate-200 bg-white shadow-lg z-20 py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setWsMenuOpen(false);
                      navigate(`/w/${wsSlug}/settings`);
                    }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 flex items-center gap-2"
                  >
                    <span>⚙</span>
                    <span>Workspace settings</span>
                  </button>

                  <div className="border-t border-slate-100 mt-1 pt-1">
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
                            ? "w-full text-left px-3 py-1.5 text-sm bg-slate-50 font-medium flex items-center justify-between"
                            : "w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 flex items-center justify-between"
                        }
                      >
                        <span>{w.name}</span>
                        {w.id === currentWs?.id && (
                          <span className="text-slate-400 text-xs">✓</span>
                        )}
                      </button>
                    ))}
                  </div>

                  <div className="border-t border-slate-100 mt-1 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setWsMenuOpen(false);
                        setNewWsName("");
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
                className="rounded-full hover:opacity-80"
                title={me?.display_name ?? me?.email ?? "Account menu"}
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-sm font-medium text-slate-700">
                  {(me?.display_name ?? me?.email ?? "?").slice(0, 1).toUpperCase()}
                </span>
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
                      navigate(`/w/${wsSlug}/profile`);
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
        {!hideSidebar && (
          <SidebarNav wsSlug={wsSlug ?? ""} currentWsId={currentWs?.id ?? ""} />
        )}

        <main className="flex-1 p-8 overflow-auto">
          <Outlet />
        </main>
      </div>

      {newWsModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => setNewWsModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-lg bg-white shadow-xl p-5 space-y-4"
          >
            <h2 className="text-lg font-semibold text-slate-900">New workspace</h2>
            <form onSubmit={onCreateWorkspace} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="modal-ws-name">Name</Label>
                <Input
                  id="modal-ws-name"
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  required
                  minLength={1}
                  maxLength={100}
                  placeholder="Engineering"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setNewWsModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    createWsMutation.isPending ||
                    slugifyWorkspace(newWsName).length < 2
                  }
                >
                  {createWsMutation.isPending ? "Creating…" : "Create"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <CommandPalette />
    </div>
  );
}

function deriveProjectKey(name: string): string {
  // Strip non-letters, take first letter of each word; fall back to first 3 letters.
  const words = name.trim().split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
  if (words.length >= 2) {
    return words.slice(0, 4).map((w) => w[0].toUpperCase()).join("");
  }
  const single = (words[0] ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  return single.slice(0, 3);
}

function SidebarNav({ wsSlug, currentWsId }: { wsSlug: string; currentWsId: string }) {
  const navigate = useNavigate();
  const { pKey: activePKey } = useParams();
  const { data: projects = [] } = useProjects(currentWsId);
  const createMutation = useCreateProject(currentWsId);
  const deleteMutation = useDeleteProject(currentWsId);

  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const derivedKey = deriveProjectKey(name);

  // Kebab menu state — which project's menu is open
  const [openMenuPid, setOpenMenuPid] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close modal on Esc
  useEffect(() => {
    if (!showModal) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowModal(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showModal]);

  // Outside click closes kebab
  useEffect(() => {
    if (!openMenuPid) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuPid(null);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [openMenuPid]);

  function openModal() {
    setName("");
    setShowModal(true);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!currentWsId) return;
    if (derivedKey.length < 2) {
      toast.error("Project name needs at least 2 letters");
      return;
    }
    try {
      const p = await createMutation.mutateAsync({ name, key: derivedKey });
      toast.success(`Created ${p.name}`);
      setShowModal(false);
      setName("");
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
    if (!confirm(`Delete project "${projectName}"? Deletes all its tasks and sprints.`)) return;
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
        My tasks
      </button>

      <hr className="my-3" />

      <div className="flex items-center justify-between px-2 pb-1">
        <span className="text-xs uppercase text-slate-400 font-medium">Projects</span>
        <button
          type="button"
          onClick={openModal}
          className="text-slate-500 hover:text-slate-900 text-base leading-none"
          title="New project"
        >
          +
        </button>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => setShowModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-lg bg-white shadow-xl p-5 space-y-4"
          >
            <h2 className="text-lg font-semibold text-slate-900">New project</h2>
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
                {derivedKey.length >= 2 && (
                  <p className="text-xs text-muted-foreground">
                    Issues will be named{" "}
                    <span className="font-mono text-slate-700">{derivedKey}-1</span>,{" "}
                    <span className="font-mono text-slate-700">{derivedKey}-2</span>, …
                  </p>
                )}
                {name.length > 0 && derivedKey.length < 2 && (
                  <p className="text-xs text-red-500">
                    Name needs at least 2 letters.
                  </p>
                )}
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
                  disabled={createMutation.isPending || derivedKey.length < 2}
                >
                  {createMutation.isPending ? "Creating…" : "Create"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {projects.length === 0 && (
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
              <span className="truncate min-w-0">{p.name}</span>
              <div className="relative" ref={openMenuPid === p.id ? menuRef : undefined}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuPid(openMenuPid === p.id ? null : p.id);
                  }}
                  className={
                    openMenuPid === p.id
                      ? "text-slate-700 px-1"
                      : "opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-900 px-1"
                  }
                  title={`More for ${p.name}`}
                >
                  ⋯
                </button>
                {openMenuPid === p.id && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-full mt-1 w-40 rounded-md border border-slate-200 bg-white shadow-lg z-30 py-1"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setOpenMenuPid(null);
                        navigate(`/w/${wsSlug}/p/${p.key}/settings`);
                      }}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50"
                    >
                      Project settings
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        setOpenMenuPid(null);
                        onDelete(e, p.id, p.name);
                      }}
                      className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                    >
                      Delete project
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
