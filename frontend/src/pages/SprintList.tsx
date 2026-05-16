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

function fmtShort(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function sprintMeta(s: Sprint): string {
  if (!s.start_at && !s.end_at) return "No dates set";
  const range = `${fmtShort(s.start_at)} → ${fmtShort(s.end_at)}`;
  const dur = daysBetween(s.start_at, s.end_at);
  const durText = dur !== null ? ` · ${dur} day${dur === 1 ? "" : "s"}` : "";
  if (s.status === "planned" && s.start_at) {
    const d = daysUntil(s.start_at);
    if (d !== null) {
      if (d > 0) return `${range}${durText} · Starts in ${d} day${d === 1 ? "" : "s"}`;
      if (d === 0) return `${range}${durText} · Starts today`;
      return `${range}${durText} · Should have started ${Math.abs(d)}d ago`;
    }
  }
  if (s.status === "active" && s.end_at) {
    const d = daysUntil(s.end_at);
    if (d !== null) {
      if (d > 0) return `${range}${durText} · ${d} day${d === 1 ? "" : "s"} left`;
      if (d === 0) return `${range}${durText} · Ends today`;
      return `${range}${durText} · ${Math.abs(d)}d overdue`;
    }
  }
  return `${range}${durText}`;
}

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
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");

  function resetForm() {
    setName("");
    setStartAt("");
    setEndAt("");
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!currentProject) return;
    if (startAt && endAt && new Date(endAt) < new Date(startAt)) {
      toast.error("End date must be after start date");
      return;
    }
    try {
      const s = await createMutation.mutateAsync({
        name,
        start_at: startAt || null,
        end_at: endAt || null,
      });
      toast.success(`Created ${s.name}`);
      setShowForm(false);
      resetForm();
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
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button
          onClick={() => {
            setShowForm((v) => !v);
            if (showForm) resetForm();
          }}
        >
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="sprint-start">Start date</Label>
                  <input
                    id="sprint-start"
                    type="date"
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sprint-end">End date</Label>
                  <input
                    id="sprint-end"
                    type="date"
                    value={endAt}
                    onChange={(e) => setEndAt(e.target.value)}
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Dates are optional — you can set them later from the sprint detail.
                The sprint starts as Planned; click <span className="font-medium">Start
                sprint</span> on its detail page to activate it.
              </p>
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
                    className="text-left p-4 rounded border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-colors"
                    onClick={() =>
                      navigate(`/w/${wsSlug}/p/${pKey}/sprints/${s.id}`)
                    }
                  >
                    <div className="font-medium text-slate-900">{s.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {sprintMeta(s)}
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
