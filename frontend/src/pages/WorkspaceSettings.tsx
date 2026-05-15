import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useCreateLabel,
  useDeleteLabel,
  useLabels,
} from "@/features/labels/api";
import {
  type WorkspaceRole,
  useInviteMember,
  useMembers,
  useRemoveMember,
  useUpdateMemberRole,
} from "@/features/members/api";
import {
  useDeleteWorkspace,
  useUpdateWorkspace,
  useWorkspaces,
} from "@/features/workspaces/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export default function WorkspaceSettings() {
  const { wsSlug } = useParams();
  const navigate = useNavigate();
  const { data: workspaces = [] } = useWorkspaces();
  const { data: me } = useCurrentUser();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const wsId = currentWs?.id ?? "";
  const isOwner = !!me && currentWs?.owner_id === me.id;

  const { data: members = [], isLoading } = useMembers(wsId);
  const inviteMutation = useInviteMember(wsId);
  const updateRoleMutation = useUpdateMemberRole(wsId);
  const removeMutation = useRemoveMember(wsId);

  const { data: labels = [], isLoading: labelsLoading } = useLabels(wsId);
  const createLabelMutation = useCreateLabel(wsId);
  const deleteLabelMutation = useDeleteLabel(wsId);

  const updateWsMutation = useUpdateWorkspace();
  const deleteWsMutation = useDeleteWorkspace();

  const [inviteEmail, setInviteEmail] = useState("");
  const [labelName, setLabelName] = useState("");
  const [labelColor, setLabelColor] = useState("#6366f1");
  const [wsName, setWsName] = useState("");

  useEffect(() => {
    if (currentWs) setWsName(currentWs.name);
  }, [currentWs]);

  async function onRenameWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!currentWs || !wsName.trim() || wsName === currentWs.name) return;
    try {
      await updateWsMutation.mutateAsync({
        wsId: currentWs.id,
        payload: { name: wsName.trim() },
      });
      toast.success("Workspace renamed");
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to rename";
      toast.error(detail);
    }
  }

  async function onDeleteWorkspace() {
    if (!currentWs) return;
    if (
      !confirm(
        `Delete workspace "${currentWs.name}"? This permanently removes all its projects, issues, sprints, comments, and labels.`,
      )
    )
      return;
    try {
      await deleteWsMutation.mutateAsync(currentWs.id);
      toast.success("Workspace deleted");
      const remaining = workspaces.filter((w) => w.id !== currentWs.id);
      if (remaining.length > 0) {
        navigate(`/w/${remaining[0].slug}`, { replace: true });
      } else {
        navigate("/onboarding", { replace: true });
      }
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to delete workspace";
      toast.error(detail);
    }
  }

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    try {
      await inviteMutation.mutateAsync({ email: inviteEmail.trim() });
      toast.success(`Invited ${inviteEmail.trim()}`);
      setInviteEmail("");
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to invite member";
      toast.error(detail);
    }
  }

  async function onChangeRole(userId: string, role: WorkspaceRole) {
    try {
      await updateRoleMutation.mutateAsync({ userId, role });
      toast.success("Role updated");
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to update role";
      toast.error(detail);
    }
  }

  async function onAddLabel(e: React.FormEvent) {
    e.preventDefault();
    if (!labelName.trim()) return;
    try {
      await createLabelMutation.mutateAsync({
        name: labelName.trim(),
        color: labelColor,
      });
      toast.success(`Label "${labelName.trim()}" created`);
      setLabelName("");
      setLabelColor("#6366f1");
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to create label";
      toast.error(detail);
    }
  }

  async function onDeleteLabel(labelId: string, name: string) {
    if (!confirm(`Delete label "${name}"?`)) return;
    try {
      await deleteLabelMutation.mutateAsync(labelId);
      toast.success("Label deleted");
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to delete label";
      toast.error(detail);
    }
  }

  async function onRemove(userId: string, display: string) {
    if (!confirm(`Remove ${display} from this workspace?`)) return;
    try {
      await removeMutation.mutateAsync(userId);
      toast.success("Member removed");
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to remove member";
      toast.error(detail);
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold text-slate-900">Workspace Settings</h1>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">General</h2>
        <form onSubmit={onRenameWorkspace} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="ws-name">Name</Label>
            <Input
              id="ws-name"
              value={wsName}
              onChange={(e) => setWsName(e.target.value)}
              maxLength={100}
              disabled={!isOwner}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ws-slug">URL slug</Label>
            <Input
              id="ws-slug"
              value={currentWs?.slug ?? ""}
              readOnly
              className="bg-slate-50 text-muted-foreground cursor-default font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Used in URLs. Cannot be changed (would break existing links).
            </p>
          </div>
          {isOwner ? (
            <Button
              type="submit"
              size="sm"
              disabled={
                updateWsMutation.isPending ||
                !wsName.trim() ||
                wsName === currentWs?.name
              }
            >
              {updateWsMutation.isPending ? "Saving…" : "Save"}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Only the workspace owner can rename.
            </p>
          )}
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">
          Invite a member
        </h2>
        <form onSubmit={onInvite} className="flex gap-2">
          <input
            type="email"
            className="flex-1 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm"
            placeholder="user@example.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
          />
          <Button
            type="submit"
            size="sm"
            disabled={inviteMutation.isPending || !inviteEmail.trim()}
          >
            {inviteMutation.isPending ? "Inviting…" : "Invite"}
          </Button>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">Members</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="rounded border border-slate-200 bg-white divide-y divide-slate-100">
            {members.map((m) => {
              const display = m.email ?? m.user_id;
              const isOwner = m.role === "owner";
              return (
                <div
                  key={m.user_id}
                  className="flex items-center justify-between px-4 py-3 gap-4"
                >
                  <span className="text-sm text-slate-700 flex-1 truncate">
                    {display}
                  </span>
                  {isOwner ? (
                    <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                      owner
                    </span>
                  ) : (
                    <select
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                      value={m.role}
                      onChange={(e) =>
                        onChangeRole(m.user_id, e.target.value as WorkspaceRole)
                      }
                      disabled={updateRoleMutation.isPending}
                    >
                      <option value="admin">admin</option>
                      <option value="member">member</option>
                    </select>
                  )}
                  {!isOwner && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:bg-red-50 shrink-0"
                      onClick={() => onRemove(m.user_id, display)}
                      disabled={removeMutation.isPending}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">Labels</h2>

        {labelsLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="rounded border border-slate-200 bg-white divide-y divide-slate-100">
            {labels.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">
                No labels yet.
              </p>
            ) : (
              labels.map((label) => (
                <div
                  key={label.id}
                  className="flex items-center justify-between px-4 py-3 gap-4"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span
                      className="inline-block h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: label.color }}
                    />
                    <span className="text-sm text-slate-700 truncate">
                      {label.name}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:bg-red-50 shrink-0"
                    onClick={() => onDeleteLabel(label.id, label.name)}
                    disabled={deleteLabelMutation.isPending}
                  >
                    Delete
                  </Button>
                </div>
              ))
            )}
          </div>
        )}

        <form onSubmit={onAddLabel} className="flex gap-2 items-center">
          <input
            type="text"
            className="flex-1 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm"
            placeholder="Label name"
            value={labelName}
            onChange={(e) => setLabelName(e.target.value)}
            required
          />
          <input
            type="color"
            className="h-8 w-10 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
            value={labelColor}
            onChange={(e) => setLabelColor(e.target.value)}
            title="Pick a color"
          />
          <Button
            type="submit"
            size="sm"
            disabled={createLabelMutation.isPending || !labelName.trim()}
          >
            {createLabelMutation.isPending ? "Adding…" : "Add"}
          </Button>
        </form>
      </section>

      <section className="space-y-3 border-t border-red-200 pt-8">
        <h2 className="text-lg font-semibold text-red-700">Danger zone</h2>
        {isOwner ? (
          <div className="rounded border border-red-200 bg-red-50 p-4 space-y-2">
            <p className="text-sm text-slate-700">
              Delete this workspace and everything in it. This cannot be
              undone.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={onDeleteWorkspace}
              disabled={deleteWsMutation.isPending}
              className="border-red-300 text-red-700 hover:bg-red-100"
            >
              {deleteWsMutation.isPending ? "Deleting…" : "Delete workspace"}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Only the workspace owner can delete this workspace.
          </p>
        )}
      </section>
    </div>
  );
}
