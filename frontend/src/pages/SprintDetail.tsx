import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useIssues } from "@/features/issues/api";
import {
  useCompleteSprint,
  useDeleteSprint,
  useSprint,
  useStartSprint,
  useUpdateSprint,
} from "@/features/sprints/api";

export default function SprintDetail() {
  const { wsSlug, pKey, sprintId } = useParams();
  const navigate = useNavigate();

  const { data: sprint } = useSprint(sprintId ?? "");
  const { data: issues = [] } = useIssues(sprint?.project_id ?? "", {
    sprint: sprintId,
  });

  const updateMutation = useUpdateSprint(sprintId ?? "");
  const startMutation = useStartSprint();
  const completeMutation = useCompleteSprint();
  const deleteMutation = useDeleteSprint();

  const [nameDraft, setNameDraft] = useState("");
  useEffect(() => {
    if (sprint) setNameDraft(sprint.name);
  }, [sprint]);

  if (!sprint) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  async function onStart() {
    if (!sprint) return;
    try {
      await startMutation.mutateAsync(sprint.id);
      toast.success(`Sprint ${sprint.name} started`);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to start sprint";
      toast.error(detail);
    }
  }

  async function onComplete() {
    if (!sprint) return;
    if (
      !confirm(
        `Complete ${sprint.name}? Unfinished issues will roll over to the next planned sprint, or to the backlog.`,
      )
    )
      return;
    try {
      const result = await completeMutation.mutateAsync(sprint.id);
      toast.success(
        result.rolled_over_to
          ? `Completed. ${result.count} issues rolled over.`
          : result.count
            ? `Completed. ${result.count} unfinished issues moved to backlog.`
            : `Completed.`,
      );
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to complete sprint";
      toast.error(detail);
    }
  }

  async function onDelete() {
    if (!sprint) return;
    if (!confirm(`Delete ${sprint.name}?`)) return;
    try {
      await deleteMutation.mutateAsync(sprint.id);
      toast.success("Sprint deleted");
      navigate(`/w/${wsSlug}/p/${pKey}/sprints`);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to delete sprint";
      toast.error(detail);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <p className="text-xs uppercase text-muted-foreground">
          Sprint · {sprint.status}
        </p>
        <input
          className="w-full bg-transparent text-2xl font-bold text-slate-900 outline-none focus:bg-slate-100 rounded px-1 py-0.5 -mx-1"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => {
            if (nameDraft !== sprint.name && nameDraft.length > 0) {
              updateMutation.mutate({ name: nameDraft });
            }
          }}
        />
      </div>

      <div className="flex gap-2">
        {sprint.status === "planned" && (
          <Button onClick={onStart} disabled={startMutation.isPending}>
            {startMutation.isPending ? "Starting…" : "Start sprint"}
          </Button>
        )}
        {sprint.status === "active" && (
          <Button onClick={onComplete} disabled={completeMutation.isPending}>
            {completeMutation.isPending ? "Completing…" : "Complete sprint"}
          </Button>
        )}
        {sprint.status !== "active" && (
          <Button variant="outline" onClick={onDelete} className="text-red-600 hover:bg-red-50">
            Delete
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => navigate(`/w/${wsSlug}/p/${pKey}/sprints`)}
        >
          Back
        </Button>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">
          Issues ({issues.length})
        </h2>
        {issues.length === 0 ? (
          <p className="text-sm text-muted-foreground">No issues assigned.</p>
        ) : (
          <div className="overflow-hidden rounded border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">ID</th>
                  <th className="px-3 py-2 text-left font-medium">Title</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((i) => (
                  <tr
                    key={i.id}
                    className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                    onClick={() =>
                      navigate(`/w/${wsSlug}/p/${pKey}/issues/${i.identifier}`)
                    }
                  >
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">
                      {i.identifier}
                    </td>
                    <td className="px-3 py-2">{i.title}</td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">
                        {i.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
