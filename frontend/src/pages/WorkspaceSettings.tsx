import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { SettingsLayout } from "@/components/SettingsLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  const updateWsMutation = useUpdateWorkspace();
  const deleteWsMutation = useDeleteWorkspace();

  const [inviteEmail, setInviteEmail] = useState("");
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
        `Delete workspace "${currentWs.name}"? This permanently removes all its projects, tasks, sprints, and comments.`,
      )
    )
      return;
    try {
      await deleteWsMutation.mutateAsync(currentWs.id);
      toast.success("Workspace deleted");
      const remaining = workspaces.filter((w) => w.id !== currentWs.id);
      if (remaining.length > 0) {
        navigate(`/w/${remaining[0].slug}/settings`, { replace: true });
      } else {
        navigate("/", { replace: true });
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
    <SettingsLayout>
      <header className="mb-10">
        <h1 className="text-3xl font-semibold text-slate-900">
          Workspace Settings
        </h1>
        <p className="mt-2 text-slate-500">
          General configuration, members, and lifecycle for{" "}
          <span className="font-medium text-slate-700">
            {currentWs?.name ?? "this workspace"}
          </span>
          .
        </p>
      </header>

      <div className="space-y-10 min-w-0">
        <section className="space-y-4">
          <h2 className="text-xl font-medium text-slate-900">
            General settings
          </h2>
          <form onSubmit={onRenameWorkspace}>
            <div className="rounded-lg border border-slate-200 bg-white">
              <SettingRow
                label="Workspace name"
                description="Displayed throughout the app."
              >
                <div className="flex items-center gap-2">
                  <Input
                    value={wsName}
                    onChange={(e) => setWsName(e.target.value)}
                    maxLength={100}
                    disabled={!isOwner}
                    className="max-w-xs"
                  />
                  <Button
                    type="submit"
                    disabled={
                      !isOwner ||
                      updateWsMutation.isPending ||
                      !wsName.trim() ||
                      wsName === currentWs?.name
                    }
                  >
                    {updateWsMutation.isPending ? "Saving…" : "Save changes"}
                  </Button>
                </div>
                {!isOwner && (
                  <p className="mt-2 text-xs text-slate-500">
                    Only the workspace owner can rename.
                  </p>
                )}
              </SettingRow>
            </div>
          </form>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-medium text-slate-900">Members</h2>
          <div className="rounded-lg border border-slate-200 bg-white">
            <form
              onSubmit={onInvite}
              className="flex gap-2 p-4 border-b border-slate-200"
            >
              <Input
                type="email"
                className="flex-1"
                placeholder="Invite by email…"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
              <Button
                type="submit"
                disabled={inviteMutation.isPending || !inviteEmail.trim()}
              >
                {inviteMutation.isPending ? "Inviting…" : "Invite"}
              </Button>
            </form>

            <div className="px-4 py-2 grid grid-cols-[1fr_140px_80px] gap-4 text-xs uppercase text-slate-400 font-medium border-b border-slate-200">
              <span>Member</span>
              <span>Role</span>
              <span />
            </div>

            {isLoading ? (
              <p className="px-4 py-4 text-sm text-slate-500">Loading…</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {members.map((m) => {
                  const display = m.email ?? m.user_id;
                  const memberIsOwner = m.role === "owner";
                  return (
                    <div
                      key={m.user_id}
                      className="grid grid-cols-[1fr_140px_80px] gap-4 items-center px-4 py-3"
                    >
                      <span className="text-sm text-slate-700 truncate">
                        {display}
                      </span>
                      {memberIsOwner ? (
                        <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded w-fit">
                          Owner
                        </span>
                      ) : (
                        <select
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-sm w-fit"
                          value={m.role}
                          onChange={(e) =>
                            onChangeRole(
                              m.user_id,
                              e.target.value as WorkspaceRole,
                            )
                          }
                          disabled={updateRoleMutation.isPending}
                        >
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                        </select>
                      )}
                      {!memberIsOwner ? (
                        <button
                          type="button"
                          className="text-xs text-red-600 hover:underline justify-self-end"
                          onClick={() => onRemove(m.user_id, display)}
                          disabled={removeMutation.isPending}
                        >
                          Remove
                        </button>
                      ) : (
                        <span />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-medium text-red-700">Danger zone</h2>
          <div className="rounded-lg border border-red-200 bg-white">
            <SettingRow
              label="Delete Workspace"
              description="Permanently delete this workspace and everything in it. This cannot be undone."
            >
              {isOwner ? (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onDeleteWorkspace}
                    disabled={deleteWsMutation.isPending}
                    className="border-red-300 text-red-700 hover:bg-red-50"
                  >
                    {deleteWsMutation.isPending
                      ? "Deleting…"
                      : "Delete Workspace"}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  Only the workspace owner can delete this workspace.
                </p>
              )}
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
