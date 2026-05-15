import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProjects } from "@/features/projects/api";
import {
  Sprint,
  SprintStatus,
  useCreateSprint,
  useSprints,
} from "@/features/sprints/api";
import { useWorkspaces } from "@/features/workspaces/api";

const STATUS_GROUPS: { status: SprintStatus; label: string }[] = [
  { status: "active", label: "Active" },
  { status: "planned", label: "Planned" },
  { status: "completed", label: "Completed" },
];

export default function SprintList() {
  const { wsSlug, pKey } = useParams();
  const navigate = useNavigate();

  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const { data: projects = [] } = useProjects(currentWs?.id ?? "");
  const currentProject = projects.find((p) => p.key === pKey);

  const { data: sprints = [], isLoading } = useSprints(currentProject?.id ?? "");
  const createMutation = useCreateSprint(currentProject?.id ?? "");

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!currentProject) return;
    try {
      const s = await createMutation.mutateAsync({ name });
      toast.success(`Created ${s.name}`);
      setShowForm(false);
      setName("");
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to create sprint";
      toast.error(detail);
    }
  }

  if (!currentProject) return null;

  const byStatus = (s: SprintStatus) => sprints.filter((x) => x.status === s);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase text-muted-foreground">
            {currentProject.key}
          </p>
          <h1 className="text-2xl font-bold text-slate-900">Sprints</h1>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "New sprint"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>New sprint</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onCreate} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="sprint-name">Name</Label>
                <Input
                  id="sprint-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={1}
                  maxLength={100}
                  placeholder="Sprint 1"
                />
              </div>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : "Create"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading && <p>Loading sprints…</p>}

      {STATUS_GROUPS.map(({ status, label }) => {
        const items = byStatus(status);
        return (
          <section key={status} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase text-muted-foreground">
              {label} <span className="text-slate-400">({items.length})</span>
            </h2>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sprints.</p>
            ) : (
              <div className="grid gap-2">
                {items.map((s: Sprint) => (
                  <button
                    key={s.id}
                    type="button"
                    className="text-left p-4 rounded border border-slate-200 bg-white hover:bg-slate-50"
                    onClick={() =>
                      navigate(`/w/${wsSlug}/p/${pKey}/sprints/${s.id}`)
                    }
                  >
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {s.start_at
                        ? new Date(s.start_at).toLocaleDateString()
                        : "—"}{" "}
                      →{" "}
                      {s.end_at ? new Date(s.end_at).toLocaleDateString() : "—"}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
