import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateWorkspace } from "@/features/workspaces/api";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export default function Onboarding() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const createMutation = useCreateWorkspace();

  function onNameChange(v: string) {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const ws = await createMutation.mutateAsync({ name, slug });
      toast.success(`Created workspace ${ws.name}`);
      navigate(`/w/${ws.slug}`);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to create workspace";
      toast.error(detail);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome to tracker</CardTitle>
          <CardDescription>
            Let's create your first workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">Workspace name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                required
                minLength={1}
                maxLength={100}
                placeholder="Engineering"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="slug">URL slug</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugTouched(true);
                }}
                required
                minLength={2}
                maxLength={50}
                pattern="[a-z0-9-]+"
                placeholder="eng"
              />
              <p className="text-xs text-muted-foreground">
                Used in your workspace URL: /w/{slug || "your-slug"}
              </p>
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Creating…" : "Create workspace"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
