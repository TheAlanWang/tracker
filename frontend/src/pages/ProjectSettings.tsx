// Project Settings page.
//
// Lives under SettingsLayout. Lets a workspace member edit the project's
// name + description, or delete it (destructive — confirms via window.confirm).
// Workspace membership is enforced server-side; this page assumes any user
// who reaches it is allowed to see + edit the project.

import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { SettingsLayout } from "@/components/SettingsLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type Project,
  useDeleteProject,
  useProjects,
  useUpdateProject,
} from "@/features/projects/api";
import { useTasks } from "@/features/tasks/api";
import { useWorkspaces } from "@/features/workspaces/api";
import { PROJECT_COLOR_PALETTE } from "@/lib/projectColor";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function ProjectSettings() {
  useDocumentTitle("Project Settings");
  const { wsSlug, pKey } = useParams();
  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const wsId = currentWs?.id ?? "";
  const { data: projects = [] } = useProjects(wsId);
  const currentProject = projects.find((p) => p.key === pKey);

  if (!currentProject) return null;
  // Keyed remount so name + description drafts re-initialise from the new
  // project's data on every navigation. Avoids a setState-in-effect sync.
  return (
    <ProjectSettingsContent
      key={currentProject.id}
      project={currentProject}
      wsId={wsId}
      wsSlug={wsSlug ?? ""}
    />
  );
}

function ProjectSettingsContent({
  project: currentProject,
  wsId,
  wsSlug,
}: {
  project: Project;
  wsId: string;
  wsSlug: string;
}) {
  const navigate = useNavigate();
  const updateMutation = useUpdateProject(wsId);
  const deleteMutation = useDeleteProject(wsId);

  const [name, setName] = useState(currentProject.name);
  // Drafts for the key. The Input keeps the user's raw typing; we uppercase
  // + strip on submit so the round-trip to the backend always sends a value
  // matching `^[A-Z][A-Z0-9]*$`.
  const [keyDraft, setKeyDraft] = useState(currentProject.key);
  // Color draft. null = use the hash-derived fallback; we send "" to the
  // backend on save in that case so the column clears to NULL.
  const [colorDraft, setColorDraft] = useState<string | null>(
    currentProject.color,
  );

  // Used in the rename-confirmation copy: "Rename N existing tasks ...".
  // Fetched lazily — we only need a count, but useTasks already powers the
  // List page so the cache is usually warm.
  const { data: projectTasks = [] } = useTasks(currentProject.id);

  const normalisedKey = keyDraft.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const keyChanged = normalisedKey !== currentProject.key;
  const keyValid = /^[A-Z][A-Z0-9]*$/.test(normalisedKey) && normalisedKey.length >= 2;

  const dirty =
    name !== currentProject.name ||
    keyChanged ||
    colorDraft !== currentProject.color;

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;

    // A key rename rewrites every existing task identifier (TES-12 → NEW-12).
    // Linear / Jira both confirm before doing this — external Slack links /
    // bookmarks / pasted IDs that reference the old prefix will stop
    // matching, so the user should see a count before agreeing.
    if (keyChanged) {
      if (!keyValid) {
        toast.error("Key must start with a letter and use A–Z / 0–9 only.");
        return;
      }
      const n = projectTasks.length;
      const ok = confirm(
        n === 0
          ? `Change project key to ${normalisedKey}?`
          : `Change project key to ${normalisedKey}? This will rename ${n} existing task${n === 1 ? "" : "s"} from ${currentProject.key}-* to ${normalisedKey}-*. External links that reference the old key will stop resolving.`,
      );
      if (!ok) return;
    }

    try {
      await updateMutation.mutateAsync({
        projectId: currentProject.id,
        payload: {
          name,
          ...(keyChanged ? { key: normalisedKey } : {}),
          // Always send color when it differs — empty string clears the
          // override on the backend (falls back to hash-derived hue).
          ...(colorDraft !== currentProject.color
            ? { color: colorDraft ?? "" }
            : {}),
        },
      });
      toast.success(keyChanged ? "Project updated and tasks renamed" : "Project updated");
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to update project";
      toast.error(detail);
    }
  }

  async function onDelete() {
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

  return (
    <SettingsLayout>
      <header className="mb-10">
        <h1 className="text-3xl font-semibold text-slate-900 dark:text-neutral-200">
          Project Settings
        </h1>
        <p className="mt-2 text-slate-500 dark:text-neutral-400">
          Configure{" "}
          <span className="font-medium text-slate-700 dark:text-neutral-300">
            {currentProject.name}
          </span>{" "}
          — rename, describe, or delete.
        </p>
      </header>

      <div className="space-y-10 min-w-0">
        <section className="space-y-4">
          <h2 className="text-xl font-medium text-slate-900 dark:text-neutral-200">
            General Settings
          </h2>
          <form onSubmit={onSave}>
            <div className="rounded-lg border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 divide-y divide-slate-100 dark:divide-neutral-800">
              <SettingRow
                label="Project Name"
                description="Shown in the sidebar and project header."
              >
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={1}
                  maxLength={100}
                  className="max-w-md"
                />
              </SettingRow>
              <SettingRow
                label="Project Key"
                description="Used as the prefix on every task ID."
              >
                {/* Input on its own row so it has the same visual weight
                    as the Description textarea below — both fill the
                    right column. Preview moves under the input as a
                    helper line, not as a sibling column. */}
                <div className="space-y-2">
                  <Input
                    value={keyDraft}
                    onChange={(e) => setKeyDraft(e.target.value)}
                    className="max-w-md font-mono uppercase tracking-wider"
                    minLength={2}
                    maxLength={10}
                  />
                  <p className="text-xs text-slate-500 dark:text-neutral-400 whitespace-nowrap overflow-hidden text-ellipsis">
                    Task IDs:{" "}
                    {[1, 2, 3].map((n) => (
                      <span key={n}>
                        <span className="font-mono text-slate-700 dark:text-neutral-300">
                          {(normalisedKey || "KEY")}-{n}
                        </span>
                        {n < 3 ? ", " : " …"}
                      </span>
                    ))}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-neutral-400">
                    2–10 characters · uppercase letters and digits
                  </p>
                  {keyChanged && (
                    <div className="rounded-md border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                      <span className="font-medium">Heads up:</span> changing
                      the key renames{" "}
                      <span className="font-mono font-medium">
                        {projectTasks.length}
                      </span>{" "}
                      existing task
                      {projectTasks.length === 1 ? "" : "s"} from{" "}
                      <span className="font-mono">{currentProject.key}-*</span>{" "}
                      →{" "}
                      <span className="font-mono">
                        {normalisedKey || "?"}-*
                      </span>
                      . External links to old identifiers will break.
                    </div>
                  )}
                </div>
              </SettingRow>
              <SettingRow label="Color">
                <div className="flex items-center gap-2.5 flex-wrap">
                  {PROJECT_COLOR_PALETTE.map((c) => {
                    const active = colorDraft === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColorDraft(c)}
                        aria-label={c}
                        title={c}
                        className={`relative w-6 h-6 rounded-full transition-transform hover:scale-110 focus:outline-none ${
                          active
                            ? "ring-2 ring-offset-2 ring-slate-900 dark:ring-neutral-100 dark:ring-offset-neutral-900"
                            : ""
                        }`}
                        style={{ backgroundColor: c }}
                      >
                        {active && (
                          <Check
                            className="absolute inset-0 m-auto w-3.5 h-3.5 text-white"
                            strokeWidth={3}
                          />
                        )}
                      </button>
                    );
                  })}
                  {/* "Default" — reset to no custom color. Same circular
                      footprint as the swatches, dashed border to signal
                      "no fill / auto-derived". Never shows a ring: when
                      no color is set, the picker reads as "nothing
                      selected" (the source of truth is the absence of a
                      ring on any swatch). */}
                  <button
                    type="button"
                    onClick={() => setColorDraft(null)}
                    aria-label="Use default color"
                    title="Use default (auto-pick from project key)"
                    className="relative w-6 h-6 rounded-full border border-dashed border-slate-300 dark:border-neutral-600 flex items-center justify-center text-[10px] leading-none font-semibold text-slate-400 dark:text-neutral-500 transition-transform hover:scale-110 hover:text-slate-600 dark:hover:text-neutral-300 focus:outline-none"
                  >
                    A
                  </button>
                </div>
              </SettingRow>
              {/* Footer bar — bg-slate-50 dark:bg-neutral-800/40 to read as a "form footer"
                  separate from data rows. The Save button only enables
                  when there's something to save. */}
              <div className="flex items-center justify-end gap-3 px-5 py-3 bg-slate-50/50 dark:bg-neutral-800/30">
                {dirty && (
                  <span className="text-xs text-slate-500 dark:text-neutral-400">Unsaved changes</span>
                )}
                <Button
                  type="submit"
                  disabled={!dirty || updateMutation.isPending}
                >
                  {updateMutation.isPending ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </div>
          </form>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-medium text-red-700 dark:text-red-400">
            Danger Zone
          </h2>
          <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 p-5 space-y-4">
            <div className="space-y-2">
              <h3 className="font-medium text-red-900 dark:text-red-300">
                Delete Project
              </h3>
              <p className="text-sm text-red-900/70 dark:text-red-300/70 leading-relaxed">
                Permanently delete this project and everything inside it —
                every task, sprint, and comment scoped to it. This cannot be
                undone.
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={onDelete}
                disabled={deleteMutation.isPending}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete Project"}
              </Button>
            </div>
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
        <div className="font-medium text-slate-900 dark:text-neutral-200">
          {label}
        </div>
        {description && (
          <p className="mt-1 text-sm text-slate-500 dark:text-neutral-400">
            {description}
          </p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
