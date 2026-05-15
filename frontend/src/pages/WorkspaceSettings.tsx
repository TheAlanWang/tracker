import { useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  type WorkspaceRole,
  useInviteMember,
  useMembers,
  useRemoveMember,
  useUpdateMemberRole,
} from "@/features/members/api";
import { useWorkspaces } from "@/features/workspaces/api";

export default function WorkspaceSettings() {
  const { wsSlug } = useParams();
  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const wsId = currentWs?.id ?? "";

  const { data: members = [], isLoading } = useMembers(wsId);
  const inviteMutation = useInviteMember(wsId);
  const updateRoleMutation = useUpdateMemberRole(wsId);
  const removeMutation = useRemoveMember(wsId);

  const [inviteEmail, setInviteEmail] = useState("");

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
    </div>
  );
}
