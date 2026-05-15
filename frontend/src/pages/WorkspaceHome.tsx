import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateProject, useProjects } from "@/features/projects/api";
import { useWorkspaces } from "@/features/workspaces/api";

export default function WorkspaceHome() {
  const { wsSlug } = useParams();
  const navigate = useNavigate();
  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);

  const { data: projects = [], isLoading } = useProjects(currentWs?.id ?? "");
  const createMutation = useCreateProject(currentWs?.id ?? "");

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
          <button
            key={p.id}
            type="button"
            className="text-left p-4 rounded border border-slate-200 bg-white hover:bg-slate-50"
            onClick={() => navigate(`/w/${wsSlug}/p/${p.key}`)}
          >
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
          </button>
        ))}
      </div>
    </div>
  );
}
