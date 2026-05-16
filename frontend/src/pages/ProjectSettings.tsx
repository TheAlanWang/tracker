import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { SettingsLayout } from "@/components/SettingsLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  const dirty =
    !!currentProject &&
    (name !== currentProject.name ||
      description !== (currentProject.description ?? ""));

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!currentProject || !dirty) return;
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
        `Delete project "${currentProject.name}"? This permanently removes all its tasks and sprints.`,
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
    <SettingsLayout>
      <header className="mb-10">
        <h1 className="text-3xl font-semibold text-slate-900">
          Project Settings
        </h1>
        <p className="mt-2 text-slate-500">
          Configure{" "}
          <span className="font-medium text-slate-700">
            {currentProject.name}
          </span>{" "}
          — rename, describe, or delete.
        </p>
      </header>

      <div className="space-y-10 min-w-0">
      <section className="space-y-4">
        <h2 className="text-xl font-medium text-slate-900">General settings</h2>
        <form onSubmit={onSave}>
          <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-200">
            <SettingRow
              label="Project name"
              description="Displayed in the sidebar and project header."
            >
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={1}
                maxLength={100}
              />
            </SettingRow>
            <SettingRow
              label="Description"
              description="Optional. Shown on the project list."
            >
              <textarea
                className="w-full rounded border border-slate-300 bg-white p-2 text-sm"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1000}
              />
            </SettingRow>
            <div className="flex justify-end p-4">
              <Button type="submit" disabled={!dirty || updateMutation.isPending}>
                {updateMutation.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-medium text-red-700">Danger zone</h2>
        <div className="rounded-lg border border-red-200 bg-white">
          <SettingRow
            label="Delete Project"
            description="Permanently delete this project and all its tasks and sprints. This cannot be undone."
          >
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={onDelete}
                disabled={deleteMutation.isPending}
                className="border-red-300 text-red-700 hover:bg-red-50"
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete Project"}
              </Button>
            </div>
          </SettingRow>
        </div>
      </section>
      </div>
    </SettingsLayout>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[280px_1fr] items-start gap-6 p-5">
      <div>
        <div className="font-medium text-slate-900">{label}</div>
        {description && (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
