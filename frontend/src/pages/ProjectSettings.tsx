import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useDeleteProject,
  useProjects,
  useUpdateProject,
} from "@/features/projects/api";
import { useWorkspaces } from "@/features/workspaces/api";

export default function ProjectSettings() {
  const { wsSlug, pKey } = useParams();
  const navigate = useNavigate();

  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const wsId = currentWs?.id ?? "";

  const { data: projects = [] } = useProjects(wsId);
  const currentProject = projects.find((p) => p.key === pKey);

  const updateMutation = useUpdateProject(wsId);
  const deleteMutation = useDeleteProject(wsId);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (currentProject) {
      setName(currentProject.name);
      setDescription(currentProject.description ?? "");
    }
  }, [currentProject]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!currentProject) return;
    try {
      await updateMutation.mutateAsync({
        projectId: currentProject.id,
        payload: { name, description: description || null },
      });
      toast.success("Project updated");
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to update project";
      toast.error(detail);
    }
  }

  async function onDelete() {
    if (!currentProject) return;
    if (
      !confirm(
        `Delete project "${currentProject.name}"? This cannot be undone.`,
      )
    )
      return;
    try {
      await deleteMutation.mutateAsync(currentProject.id);
      toast.success("Project deleted");
      navigate(`/w/${wsSlug}`);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to delete project";
      toast.error(detail);
    }
  }

  if (!currentProject) return null;

  return (
    <div className="max-w-lg space-y-6">

      <form onSubmit={onSave} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="project-key">Key</Label>
          <Input
            id="project-key"
            value={currentProject.key}
            readOnly
            className="bg-slate-50 text-muted-foreground cursor-default font-mono"
          />
          <p className="text-xs text-muted-foreground">
            The project key cannot be changed as it is part of issue identifiers.
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="project-name">Name</Label>
          <Input
            id="project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={1}
            maxLength={100}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="project-description">Description</Label>
          <textarea
            id="project-description"
            className="w-full rounded border border-slate-300 bg-white p-2 text-sm"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
          />
        </div>

        <Button type="submit" disabled={updateMutation.isPending}>
          {updateMutation.isPending ? "Saving…" : "Save"}
        </Button>
      </form>

      <section className="space-y-3 border-t border-slate-200 pt-6">
        <h2 className="text-base font-semibold text-red-600">Danger zone</h2>
        <p className="text-sm text-muted-foreground">
          Deleting this project will permanently remove all its issues and cannot
          be undone.
        </p>
        <Button
          type="button"
          variant="outline"
          className="border-red-300 text-red-600 hover:bg-red-50"
          onClick={onDelete}
          disabled={deleteMutation.isPending}
        >
          {deleteMutation.isPending ? "Deleting…" : "Delete project"}
        </Button>
      </section>
    </div>
  );
}
