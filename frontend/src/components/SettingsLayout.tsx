import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProjects } from "@/features/projects/api";
import {
  useCreateWorkspace,
  useWorkspaces,
} from "@/features/workspaces/api";
import { slugifyWorkspace } from "@/lib/slug";

type Props = {
  children: React.ReactNode;
};

// Shared settings shell: left nav lists workspaces + projects of current
// workspace, right pane is whatever the route renders (workspace settings
// or project settings). Single mental model for "settings space".
export function SettingsLayout({ children }: Props) {
  const { wsSlug, pKey } = useParams();
  const navigate = useNavigate();

  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const { data: projects = [] } = useProjects(currentWs?.id ?? "");
  const createWsMutation = useCreateWorkspace();

  // On project settings (pKey present), highlight project; otherwise highlight
  // workspace itself.
  const onProjectSettings = !!pKey;

  const [newWsOpen, setNewWsOpen] = useState(false);
  const [newWsName, setNewWsName] = useState("");

  useEffect(() => {
    if (!newWsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNewWsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newWsOpen]);

  async function onCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    const slug = slugifyWorkspace(newWsName);
    if (!slug || slug.length < 2) {
      toast.error("Workspace name is too short");
      return;
    }
    try {
      const ws = await createWsMutation.mutateAsync({ name: newWsName, slug });
      toast.success(`Created ${ws.name}`);
      setNewWsOpen(false);
      setNewWsName("");
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to create workspace";
      toast.error(detail);
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="grid grid-cols-[240px_1fr] gap-10">
        <aside className="space-y-6">
          <section className="space-y-1">
            <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold px-2 pb-1">
              Workspaces
            </p>
            {workspaces.map((w) => {
              const active = w.slug === wsSlug && !onProjectSettings;
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => navigate(`/w/${w.slug}/settings`)}
                  className={
                    active
                      ? "block w-full text-left rounded px-2 py-1.5 text-sm bg-slate-100 font-medium text-slate-900"
                      : "block w-full text-left rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  }
                >
                  {w.name}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setNewWsOpen(true)}
              className="w-full text-left rounded px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-900 inline-flex items-center gap-1.5"
            >
              <span className="text-base leading-none">+</span>
              <span>New Workspace</span>
            </button>
          </section>

          {currentWs && (
            <section className="space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold px-2 pb-1">
                Projects in {currentWs.name}
              </p>
              {projects.length === 0 ? (
                <p className="px-2 text-xs text-slate-400">
                  No projects in this workspace.
                </p>
              ) : (
                projects.map((p) => {
                  const active = p.key === pKey;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        navigate(`/w/${wsSlug}/p/${p.key}/settings`)
                      }
                      className={
                        active
                          ? "block w-full text-left rounded px-2 py-1.5 text-sm bg-slate-100 font-medium text-slate-900"
                          : "block w-full text-left rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                      }
                    >
                      {p.name}
                    </button>
                  );
                })
              )}
            </section>
          )}
        </aside>

        <main className="min-w-0">{children}</main>
      </div>

      {newWsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          onClick={() => setNewWsOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold mb-4">New Workspace</h2>
            <form onSubmit={onCreateWorkspace} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="new-ws-name">Name</Label>
                <Input
                  id="new-ws-name"
                  autoFocus
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  placeholder="Acme Inc."
                  maxLength={100}
                />
                {newWsName.trim() && (
                  <p className="text-xs text-slate-500">
                    URL slug:{" "}
                    <span className="font-mono">
                      {slugifyWorkspace(newWsName) || "—"}
                    </span>
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setNewWsOpen(false)}
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
    </div>
  );
}
