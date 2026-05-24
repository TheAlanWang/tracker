// Workspace Settings page.
//
// Sections:
//   - General: rename workspace (owner-only).
//   - Members: send invitations (admins+), list current members with role
//     management (admins+ change roles, owner-only Remove), plus pending
//     invitations inline as "Waiting" rows so admins always know what's
//     outstanding.
//   - Danger zone: delete workspace (owner-only, confirms via window.confirm).

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { InlineSpinner } from "@/components/PageSpinner";
import { SettingsLayout } from "@/components/SettingsLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type WorkspaceRole,
  useMembers,
  useRemoveMember,
  useUpdateMemberRole,
} from "@/features/members/api";
import {
  useCreateInvitation,
  useRevokeInvitation,
  useWorkspaceInvitations,
} from "@/features/invitations/api";
import {
  isSprintsEnabled,
  useDeleteWorkspace,
  useUpdateWorkspace,
  useWorkspaces,
} from "@/features/workspaces/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useSectionSidebar } from "@/hooks/useSectionSidebar";

export default function WorkspaceSettings() {
  useDocumentTitle("Workspace Settings");
  // Tier-2 in-page sub-nav (overlay rail beside SettingsSidebar). Clicks
  // smooth-scroll to the matching <section id=...> on this page.
  useSectionSidebar({
    title: "Workspace",
    sections: [
      { id: "ws-general", label: "General" },
      { id: "ws-members", label: "Members" },
      { id: "ws-features", label: "Features" },
      { id: "ws-danger", label: "Danger Zone" },
    ],
  });
  const { wsSlug: routeWsSlug } = useParams();
  const navigate = useNavigate();
  const { data: workspaces = [] } = useWorkspaces();
  const { data: me } = useCurrentUser();
  const currentWs = workspaces.find((w) => w.slug === routeWsSlug);
  const wsId = currentWs?.id ?? "";
  const isOwner = !!me && currentWs?.owner_id === me.id;

  const { data: members = [], isLoading } = useMembers(wsId);
  const { data: invitations = [] } = useWorkspaceInvitations(wsId);
  const inviteMutation = useCreateInvitation(wsId);
  const revokeMutation = useRevokeInvitation(wsId);
  const updateRoleMutation = useUpdateMemberRole(wsId);
  const removeMutation = useRemoveMember(wsId);

  const updateWsMutation = useUpdateWorkspace();
  const deleteWsMutation = useDeleteWorkspace();

  const [inviteEmail, setInviteEmail] = useState("");
  const [wsName, setWsName] = useState("");
  const [wsSlug, setWsSlug] = useState("");
  // Features draft. Tracked as booleans (not the raw JSONB shape) so the
  // dirty check compares effective on/off, respecting the default-ON
  // polarity of sprints (undefined treated as true).
  const [goalsDraft, setGoalsDraft] = useState(false);
  const [sprintsDraft, setSprintsDraft] = useState(true);

  // Sync the rename + feature drafts to the current workspace on workspace
  // switch. Keeping the component mounted (rather than the previous
  // key-remount pattern) prevents the whole settings pane from flashing
  // "Loading…" each time the user picks a different workspace in the
  // sidebar — useQuery's placeholderData keeps the old rows visible while
  // new ones load.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (currentWs) {
      setWsName(currentWs.name);
      setWsSlug(currentWs.slug);
      setGoalsDraft(!!currentWs.features?.goals);
      setSprintsDraft(isSprintsEnabled(currentWs));
    }
  }, [currentWs]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Slug validation: lowercase letters / digits / hyphens, 3-40 chars.
  // Same rule as create-time per memory's identifier case conventions.
  const wsSlugValid = /^[a-z0-9-]{3,40}$/.test(wsSlug);
  const wsSlugChanged = !!currentWs && wsSlug !== currentWs.slug;

  // Dirty tracking for the General Settings card: any field differs from
  // saved → enable Save. Name rename is benign; slug rename triggers an
  // additional confirm dialog inside onSave because it breaks external
  // URLs (bookmarks / MCP configs).
  const nameChanged =
    !!currentWs && wsName.trim() !== currentWs.name && wsName.trim() !== "";
  const dirty = nameChanged || wsSlugChanged;

  // Features card has its own draft / Save flow so toggling Goals or
  // Sprints doesn't persist on click — matches the General Settings
  // pattern above and prevents accidental flips.
  const goalsChanged =
    !!currentWs && goalsDraft !== !!currentWs.features?.goals;
  const sprintsChanged =
    !!currentWs && sprintsDraft !== isSprintsEnabled(currentWs);
  const featuresDirty = goalsChanged || sprintsChanged;

  async function onSaveFeatures() {
    if (!currentWs || !featuresDirty) return;
    try {
      await updateWsMutation.mutateAsync({
        wsId: currentWs.id,
        // Send only the keys that changed. Backend merges into the
        // existing features JSONB, so other keys aren't disturbed.
        payload: {
          features: {
            ...(goalsChanged ? { goals: goalsDraft } : {}),
            ...(sprintsChanged ? { sprints: sprintsDraft } : {}),
          },
        },
      });
      toast.success("Features updated");
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to update features";
      toast.error(detail);
    }
  }

  async function onSaveGeneral(e: React.FormEvent) {
    e.preventDefault();
    if (!currentWs || !dirty) return;
    if (wsSlugChanged && !wsSlugValid) {
      toast.error("URL must be 3-40 chars, lowercase letters / numbers / hyphens.");
      return;
    }

    // Slug rename = highest-impact action on this page. List concrete
    // breakages so the user sees scope, not vague boilerplate.
    if (wsSlugChanged) {
      const ok = confirm(
        `Change workspace URL from /w/${currentWs.slug}/ to /w/${wsSlug}/ ?\n\n` +
          `This will BREAK:\n` +
          `  • Every bookmark to any page in this workspace\n` +
          `  • Shared links in Slack, email, docs, anywhere\n` +
          `  • MCP client configs referencing "${currentWs.slug}"\n` +
          `  • Any external integration with this workspace\n\n` +
          `Old URLs return 404 immediately. No redirect.\n\n` +
          `Continue?`,
      );
      if (!ok) return;
    }

    try {
      const updated = await updateWsMutation.mutateAsync({
        wsId: currentWs.id,
        payload: {
          ...(nameChanged ? { name: wsName.trim() } : {}),
          ...(wsSlugChanged ? { slug: wsSlug } : {}),
        },
      });
      toast.success(
        wsSlugChanged
          ? `URL changed to /w/${updated.slug}/`
          : "Workspace renamed",
      );
      // Current page URL is now stale if slug changed — navigate forward.
      if (wsSlugChanged) {
        navigate(`/w/${updated.slug}/settings`, { replace: true });
      }
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 409 && wsSlugChanged) {
        toast.error(`URL "${wsSlug}" is already taken. Try another.`);
      } else {
        const detail =
          (err as { response?: { data?: { detail?: string } } }).response?.data
            ?.detail ?? "Failed to save changes";
        toast.error(detail);
      }
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
      toast.success(`Invitation sent to ${inviteEmail.trim()}`);
      setInviteEmail("");
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to send invitation";
      toast.error(detail);
    }
  }

  async function onRevoke(invitationId: string, email: string) {
    if (!confirm(`Revoke pending invitation for ${email}?`)) return;
    try {
      await revokeMutation.mutateAsync(invitationId);
      toast.success("Invitation revoked");
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to revoke";
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
        <p className="text-xs font-mono uppercase tracking-wider text-slate-400 dark:text-neutral-500 mb-0.5">
          Workspace
        </p>
        <h1 className="text-3xl font-semibold text-slate-900 dark:text-neutral-200">
          {currentWs?.name ?? "—"}
        </h1>
      </header>

      <div className="space-y-10 min-w-0">
        <section id="ws-general" className="space-y-4 scroll-mt-4">
          <h2 className="text-xl font-medium text-slate-900 dark:text-neutral-200 dark:text-neutral-200">
            General Settings
          </h2>
          <form onSubmit={onSaveGeneral}>
            <div className="rounded-lg border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 divide-y divide-slate-100 dark:divide-neutral-800">
              <SettingRow
                label="Workspace Name"
                description="Shown throughout the app."
              >
                <Input
                  value={wsName}
                  onChange={(e) => setWsName(e.target.value)}
                  maxLength={100}
                  disabled={!isOwner}
                  className="max-w-md"
                />
                {!isOwner && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-neutral-400">
                    Only the workspace owner can rename.
                  </p>
                )}
              </SettingRow>
              <SettingRow
                label="Workspace URL"
                description="The slug used in URLs and MCP tool calls."
              >
                <div className="space-y-2 max-w-md">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-slate-500 dark:text-neutral-400 whitespace-nowrap font-mono">
                      /w/
                    </span>
                    <Input
                      value={wsSlug}
                      onChange={(e) => {
                        const v = e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, "")
                          .slice(0, 40);
                        setWsSlug(v);
                      }}
                      minLength={3}
                      maxLength={40}
                      disabled={!isOwner}
                      className="font-mono"
                    />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-neutral-400">
                    3–40 characters · lowercase letters, numbers, and hyphens
                  </p>
                  {wsSlugChanged && isOwner && (
                    <div className="rounded-md border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                      <span className="font-medium">Heads up:</span> changing
                      the URL breaks every bookmark, shared link, and MCP
                      config pointing to{" "}
                      <span className="font-mono">/w/{currentWs?.slug}/</span>.
                      Old URLs return 404 — no redirect.
                    </div>
                  )}
                  {!isOwner && (
                    <p className="text-xs text-slate-500 dark:text-neutral-400">
                      Only the workspace owner can change the URL.
                    </p>
                  )}
                </div>
              </SettingRow>
              {/* Footer bar — bg-slate-50 dark:bg-neutral-800/40 reads as a
                  "form footer" separate from data rows. Single Save fires
                  the whole General-Settings dirty payload at once. */}
              <div className="flex items-center justify-end gap-3 px-5 py-3 bg-slate-50/50 dark:bg-neutral-800/30">
                {dirty && (
                  <span className="text-xs text-slate-500 dark:text-neutral-400">
                    Unsaved changes
                  </span>
                )}
                <Button
                  type="submit"
                  className="min-w-28"
                  disabled={
                    !isOwner ||
                    !dirty ||
                    updateWsMutation.isPending ||
                    (wsSlugChanged && !wsSlugValid)
                  }
                >
                  {updateWsMutation.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          </form>
        </section>

        <section id="ws-members" className="space-y-4 scroll-mt-4">
          <h2 className="text-xl font-medium text-slate-900 dark:text-neutral-200 dark:text-neutral-200">Members</h2>
          <div className="rounded-lg border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
            {/* Header zone — WHITE background. Title + summary on the
                left, invite form on the right (owner only). The slate
                tint goes on the column-header row below, not here, so
                this zone reads as content while the next reads as a
                table guide rail. */}
            <div className="px-5 py-4 border-b border-slate-200 dark:border-neutral-800">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-base font-medium text-slate-900 dark:text-neutral-200">
                    Workspace Members
                  </h3>
                  <p className="mt-0.5 text-sm text-slate-500 dark:text-neutral-400">
                    {members.length === 1
                      ? "1 member can access this workspace."
                      : `All ${members.length} members can access this workspace.`}
                  </p>
                </div>
                {isOwner && (
                  <form
                    onSubmit={onInvite}
                    className="flex items-center gap-2 shrink-0"
                  >
                    <Input
                      type="email"
                      placeholder="name@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                      className="w-64"
                    />
                    <Button
                      type="submit"
                      className="min-w-28"
                      disabled={
                        inviteMutation.isPending || !inviteEmail.trim()
                      }
                    >
                      {inviteMutation.isPending ? "Sending…" : "Invite"}
                    </Button>
                  </form>
                )}
              </div>
            </div>

            {/* Column headers — slate-50 tinted so the row reads as a
                table guide separate from the data rows beneath. */}
            <div className="bg-slate-50/70 dark:bg-neutral-800/40 px-5 py-2 grid grid-cols-[1fr_160px_60px] gap-4 text-[10px] uppercase tracking-[0.08em] text-slate-500 dark:text-neutral-400 font-medium border-b border-slate-200 dark:border-neutral-800">
              <span>Member</span>
              <span>Role</span>
              <span />
            </div>

            {isLoading ? (
              <InlineSpinner />
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-neutral-800 dark:divide-neutral-800">
                {members.map((m) => {
                  const display = m.email ?? m.user_id;
                  const memberIsOwner = m.role === "owner";
                  const isMe = me?.id === m.user_id;
                  return (
                    <div
                      key={`m-${m.user_id}`}
                      className="group grid grid-cols-[1fr_160px_60px] gap-4 items-center px-5 py-3"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm text-slate-800 dark:text-neutral-200 truncate">
                          {display}
                        </span>
                        {isMe && (
                          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-neutral-400 border border-slate-300 dark:border-neutral-700 rounded-full px-1.5 py-0.5">
                            You
                          </span>
                        )}
                      </div>
                      {memberIsOwner ? (
                        <span className="text-sm text-slate-600 dark:text-neutral-400">Owner</span>
                      ) : isOwner ? (
                        <select
                          className="rounded border border-transparent hover:border-slate-300 focus:border-slate-300 bg-transparent px-1.5 py-0.5 text-sm text-slate-700 dark:text-neutral-300 w-fit -ml-1.5"
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
                      ) : (
                        <span className="text-sm text-slate-600 dark:text-neutral-400 capitalize">
                          {m.role}
                        </span>
                      )}
                      {/* Remove only when current user is owner & target
                          isn't the owner. Hover-revealed so the row stays
                          calm by default. */}
                      {isOwner && !memberIsOwner ? (
                        <button
                          type="button"
                          className="text-xs text-slate-400 dark:text-neutral-500 hover:text-red-600 justify-self-end opacity-0 group-hover:opacity-100 transition-opacity"
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
                {/* Pending invitations sit in the same list with a "Waiting"
                    badge instead of a role — they're not members yet, but
                    keeping them visible reminds admins an invite is in
                    flight. */}
                {invitations.map((inv) => {
                  const inviter =
                    inv.invited_by_display_name ??
                    inv.invited_by_email ??
                    "Someone";
                  const sent = new Date(inv.created_at).toLocaleDateString(
                    undefined,
                    { month: "short", day: "numeric" },
                  );
                  return (
                    <div
                      key={`i-${inv.id}`}
                      className="group grid grid-cols-[1fr_160px_60px] gap-4 items-center px-5 py-3"
                    >
                      <div className="min-w-0">
                        <span className="text-sm text-slate-800 dark:text-neutral-200 truncate block">
                          {inv.invited_email}
                        </span>
                        <span className="text-[11px] text-slate-400 dark:text-neutral-500 mt-0.5 block truncate">
                          Invited by {inviter} · {sent}
                        </span>
                      </div>
                      <span className="text-sm text-amber-600 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        Waiting
                      </span>
                      {isOwner ? (
                        <button
                          type="button"
                          className="text-xs text-slate-400 dark:text-neutral-500 hover:text-red-600 justify-self-end opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => onRevoke(inv.id, inv.invited_email)}
                          disabled={revokeMutation.isPending}
                        >
                          Revoke
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

        <section id="ws-features" className="space-y-4 scroll-mt-4">
          <h2 className="text-xl font-medium text-slate-900 dark:text-neutral-200 dark:text-neutral-200">Features</h2>
          <div className="rounded-lg border border-blue-100 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-950/15 divide-y divide-blue-100/70 dark:divide-blue-900/30">
            {/* Each feature row: title + Beta pill + multi-line description
                on the left (flexes to fill), Toggle switch on the right.
                Toggles update local draft only — Save footer at the bottom
                persists. Matches General Settings' draft-then-Save flow. */}
            <FeatureRow
              title="Goals"
              description="Strategic objectives in a workspace-scoped tree. Tasks link to a goal."
              checked={goalsDraft}
              disabled={!isOwner || updateWsMutation.isPending}
              onChange={setGoalsDraft}
              note={
                !isOwner
                  ? "Only the workspace owner can toggle features."
                  : undefined
              }
            />
            <FeatureRow
              title="Sprints"
              pill={null}
              description="Time-boxed iterations attached to a project. Tasks roll up into a sprint to track progress and velocity. Disable to hide the Sprints tab, the sprint picker on tasks, and the sprint column on lists."
              checked={sprintsDraft}
              disabled={!isOwner || updateWsMutation.isPending}
              onChange={setSprintsDraft}
              note={
                !isOwner
                  ? "Only the workspace owner can toggle features."
                  : undefined
              }
            />
            <div className="flex items-center justify-end gap-3 px-5 py-3 bg-blue-50/40 dark:bg-blue-950/15">
              {featuresDirty && (
                <span className="text-xs text-slate-500 dark:text-neutral-400">
                  Unsaved changes
                </span>
              )}
              <Button
                type="button"
                onClick={onSaveFeatures}
                className="min-w-28"
                disabled={
                  !isOwner || !featuresDirty || updateWsMutation.isPending
                }
              >
                {updateWsMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </section>

        <section id="ws-danger" className="space-y-4 scroll-mt-4">
          <h2 className="text-xl font-medium text-red-700 dark:text-red-400">Danger Zone</h2>
          {/* Stacked block (same shape as Profile Settings' Danger zone):
              title → full-width prose → action button at bottom-right.
              Avoids the cramped SettingRow grid where the description gets
              wrapped into a narrow column. */}
          {/* Tinted background gives the danger zone a visual "stop sign" —
              you can tell at a glance this region is destructive without
              having to read the heading. */}
          <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 p-5 space-y-4">
            <div className="space-y-2">
              <h3 className="font-medium text-red-900 dark:text-red-300">Delete Workspace</h3>
              <p className="text-sm text-red-900/70 dark:text-red-300/70 leading-relaxed">
                Permanently delete this workspace and everything in it — every
                project, task, sprint, comment, invitation, and watcher
                subscription scoped to it. Members will lose access
                immediately. This cannot be undone.
              </p>
            </div>
            {isOwner ? (
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={onDeleteWorkspace}
                  disabled={deleteWsMutation.isPending}
                  className="min-w-28 bg-red-600 hover:bg-red-700 text-white"
                >
                  {deleteWsMutation.isPending
                    ? "Deleting…"
                    : "Delete Workspace"}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-red-900/60 italic">
                Only the workspace owner can delete this workspace.
              </p>
            )}
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
        <div className="font-medium text-slate-900 dark:text-neutral-200">{label}</div>
        {description && (
          <p className="mt-1 text-sm text-slate-500 dark:text-neutral-400">{description}</p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// FeatureRow — one entry inside the Features card. Description spans the
// full left column (no narrow constraint like SettingRow), Toggle sits
// vertically centered on the right. Optional `note` shows under the row
// content (used for the "only owner can toggle" message).
function FeatureRow({
  title,
  description,
  checked,
  disabled,
  onChange,
  note,
  pill = "Beta",
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  note?: string;
  // Small uppercase badge next to the title. Defaults to "Beta" so existing
  // call sites stay unchanged; pass `null` for mature features (Sprint).
  pill?: "Beta" | null;
}) {
  return (
    <div className="p-5">
      <div className="flex items-start gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-slate-900 dark:text-neutral-200">{title}</h3>
            {pill !== null && (
              <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-neutral-400 border border-slate-300 dark:border-neutral-700 rounded-full px-1.5 py-0.5">
                {pill}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-neutral-400 leading-relaxed">
            {description}
          </p>
        </div>
        <div className="pt-0.5 shrink-0">
          <Toggle
            checked={checked}
            onChange={onChange}
            disabled={disabled}
            label={title}
          />
        </div>
      </div>
      {note && (
        <p className="mt-2 text-xs text-slate-500 dark:text-neutral-400">{note}</p>
      )}
    </div>
  );
}

// Toggle — iOS-style switch. Kept inline because it's only used here for
// now; promote to components/ui if a second caller appears.
function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 ${
        checked ? "bg-blue-600" : "bg-slate-300"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white dark:bg-neutral-900 shadow-sm transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
}
