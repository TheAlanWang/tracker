import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateWorkspace } from "@/features/workspaces/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";

const LAST_WORKSPACE_KEY = "tracker.lastWorkspaceSlug";

function slugifyWorkspace(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export default function Home() {
  const { data: me, isLoading } = useCurrentUser();
  const navigate = useNavigate();
  const createMutation = useCreateWorkspace();
  const [name, setName] = useState("");

  useEffect(() => {
    if (!me) return;
    if (me.workspaces.length === 0) return; // show inline create form below
    const stored = localStorage.getItem(LAST_WORKSPACE_KEY);
    const target = me.workspaces.find((w) => w.slug === stored) ?? me.workspaces[0];
    navigate(`/w/${target.slug}`, { replace: true });
  }, [me, navigate]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const slug = slugifyWorkspace(name);
    if (slug.length < 2) {
      toast.error("Workspace name needs at least 2 letters");
      return;
    }
    try {
      const ws = await createMutation.mutateAsync({ name, slug });
      toast.success(`Created ${ws.name}`);
      navigate(`/w/${ws.slug}`);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to create workspace";
      toast.error(detail);
    }
  }

  if (isLoading || !me) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (me.workspaces.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-sm space-y-5">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900">
              Welcome to tracker
            </h1>
            <p className="text-sm text-slate-500">
              Create your first workspace to get started.
            </p>
          </div>
          <form onSubmit={onCreate} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="home-ws-name">Workspace name</Label>
              <Input
                id="home-ws-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={1}
                maxLength={100}
                placeholder="Engineering"
                autoFocus
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={createMutation.isPending || slugifyWorkspace(name).length < 2}
            >
              {createMutation.isPending ? "Creating…" : "Create workspace"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return null;
}
