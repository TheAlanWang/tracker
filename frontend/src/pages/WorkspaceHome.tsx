import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateProject, useDeleteProject, useProjects } from "@/features/projects/api";
import { useWorkspaces } from "@/features/workspaces/api";

export default function WorkspaceHome() {
  const { wsSlug } = useParams();
  const navigate = useNavigate();
  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);

  const { data: projects = [], isLoading } = useProjects(currentWs?.id ?? "");
  const createMutation = useCreateProject(currentWs?.id ?? "");
  const deleteMutation = useDeleteProject();

  async function onDelete(e: React.MouseEvent, projectId: string, projectName: string) {
    e.stopPropagation();
    if (!confirm(`Delete project "${projectName}"? This deletes all its issues and sprints.`)) return;
    try {
      await deleteMutation.mutateAsync(projectId);
      toast.success(`Deleted ${projectName}`);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to delete project";
      toast.error(detail);
    }
  }

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");

  async function onCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!currentWs) return;
    try {
      const p = await createMutation.mutateAsync({ name, key: key.toUpperCase() });
      toast.success(`Created project ${p.name}`);
      setShowForm(false);
      setName("");
      setKey("");
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to create project";
      toast.error(detail);
    }
  }

  if (!currentWs) return null;  // WorkspaceLayout will redirect

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Projects</h1>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "New project"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>New project</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onCreateProject} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="proj-name">Name</Label>
                <Input
                  id="proj-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Backend"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="proj-key">Key</Label>
                <Input
                  id="proj-key"
                  value={key}
                  onChange={(e) => setKey(e.target.value.toUpperCase())}
                  required
                  minLength={2}
                  maxLength={10}
                  pattern="[A-Z][A-Z0-9]*"
                  placeholder="BE"
                />
                <p className="text-xs text-muted-foreground">
                  Issues in this project will look like {key || "BE"}-1, {key || "BE"}-2, …
                </p>
              </div>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : "Create"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading && <p>Loading projects…</p>}
      {!isLoading && projects.length === 0 && (
        <p className="text-muted-foreground">
          No projects yet. Click "New project" to create your first.
        </p>
      )}
      <div className="grid gap-2">
        {projects.map((p) => (
          <div
            key={p.id}
            role="button"
            tabIndex={0}
            className="group flex items-center justify-between p-4 rounded border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer"
            onClick={() => navigate(`/w/${wsSlug}/p/${p.key}/list`)}
            onKeyDown={(e) => {
              if (e.key === "Enter") navigate(`/w/${wsSlug}/p/${p.key}/list`);
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                  {p.key}
                </span>
                <span className="font-medium">{p.name}</span>
              </div>
              {p.description && (
                <p className="text-sm text-muted-foreground mt-1">
                  {p.description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/w/${wsSlug}/p/${p.key}/settings`);
                }}
                className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1"
              >
                Settings
              </button>
              <button
                type="button"
                onClick={(e) => onDelete(e, p.id, p.name)}
                className="text-xs text-red-600 hover:bg-red-50 rounded px-2 py-1"
                disabled={deleteMutation.isPending}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
