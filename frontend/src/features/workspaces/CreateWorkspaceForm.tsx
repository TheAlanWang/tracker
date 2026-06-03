// Shared "create a workspace" form — used by both the in-app "New workspace"
// modal (WorkspaceLayout) and the first-run prompt (Home), so the two surfaces
// behave identically: a Name field + an editable, globally-unique `/w/` URL,
// with the URL live-derived from the name until the user edits it. On a slug
// collision the API returns 409 and we ask the user to pick another URL
// (first-come-first-served — the standard Slack/Linear handle model).
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

import { useCreateWorkspace, type Workspace } from "./api";
import { slugifyWorkspace } from "@/lib/slug";

type Props = {
  // Caller decides what happens after a successful create (navigate, close a
  // modal, etc.). Receives the created workspace.
  onCreated: (ws: Workspace) => void;
  // When provided, a Cancel button is rendered (modal use). Omit on first-run,
  // where there's nothing to cancel back to.
  onCancel?: () => void;
  submitLabel?: string;
  autoFocus?: boolean;
};

export function CreateWorkspaceForm({
  onCreated,
  onCancel,
  submitLabel = "Create",
  autoFocus = false,
}: Props) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  // `touched` flips on first manual edit of the slug field, after which we stop
  // auto-syncing it from the name. Otherwise users who refine the slug then
  // change the name would have their slug clobbered.
  const [slugTouched, setSlugTouched] = useState(false);
  const createMutation = useCreateWorkspace();

  // Live-derive slug from name while the user hasn't manually edited the slug
  // field. Industry-standard "name → slug suggestion" UX.
  useEffect(() => {
    if (!slugTouched) {
      setSlug(slugifyWorkspace(name));
    }
  }, [name, slugTouched]);

  // Memory rule: workspace slug = lowercase [a-z0-9-]{3,40}. Backend schema
  // allows down to 2 chars (looser), frontend enforces strict.
  const slugValid = /^[a-z0-9-]{3,40}$/.test(slug);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!slugValid) {
      toast.error("URL must be 3-40 chars, lowercase letters / numbers / hyphens.");
      return;
    }
    try {
      const ws = await createMutation.mutateAsync({ name, slug });
      toast.success(`Created ${ws.name}`);
      onCreated(ws);
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 409) {
        toast.error(`URL "${slug}" is already taken. Try another.`);
      } else {
        const detail =
          (err as { response?: { data?: { detail?: string } } }).response?.data
            ?.detail ?? "Failed to create workspace";
        toast.error(detail);
      }
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="create-ws-name">Name</Label>
        <Input
          id="create-ws-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={1}
          maxLength={100}
          placeholder="Acme Inc."
          autoFocus={autoFocus}
        />
        <p className="text-xs text-slate-500 dark:text-neutral-400">
          You can rename it anytime.
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="create-ws-slug">URL</Label>
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-slate-500 dark:text-neutral-400 whitespace-nowrap font-mono">
            /w/
          </span>
          <Input
            id="create-ws-slug"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              const v = e.target.value
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, "")
                .slice(0, 40);
              setSlug(v);
            }}
            minLength={3}
            maxLength={40}
            placeholder="acme-inc"
            className="font-mono"
          />
        </div>
        <p className="text-xs text-slate-500 dark:text-neutral-400">
          3–40 characters · lowercase letters, numbers, and hyphens. Used in URLs and MCP tool calls.
        </p>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={createMutation.isPending || !slugValid}>
          {createMutation.isPending ? "Creating…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
