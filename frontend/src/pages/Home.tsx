// Home — the root route for signed-in users. Three branches:
//   1. Pending invitations → render accept/decline panel (and hold here even
//      if the user already has workspaces — they should decide on the invite
//      before being whisked into their existing workspace).
//   2. No workspaces + no invitations → show a "Create your workspace" prompt
//      so the user names + claims their first workspace (Name + editable URL),
//      instead of silently auto-creating a generic "My workspace".
//   3. Has workspaces + no pending invitations → redirect to the last-used
//      workspace (or the first one if no preference saved).
//
// The redirect waits for `useMyInvitations()` to resolve — otherwise a
// brand-new user with a pending invite would be whisked away before the
// invite UI rendered.

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { PageSpinner } from "@/components/PageSpinner";
import { Button } from "@/components/ui/button";
import {
  useAcceptInvitation,
  useDeclineInvitation,
  useMyInvitations,
} from "@/features/invitations/api";
import { CreateWorkspaceForm } from "@/features/workspaces/CreateWorkspaceForm";
import { useCurrentUser } from "@/hooks/useCurrentUser";

const LAST_WORKSPACE_KEY = "tracker.lastWorkspaceSlug";

export default function Home() {
  const { data: me, isLoading } = useCurrentUser();
  // isPending is true on initial load before the first response; we must
  // wait for it to settle before deciding whether to auto-create a default
  // workspace, otherwise a brand-new user with a pending invitation gets a
  // workspace auto-created and never sees the invitation panel.
  const { data: invitations = [], isPending: invitationsLoading } =
    useMyInvitations();
  const acceptMutation = useAcceptInvitation();
  const declineMutation = useDeclineInvitation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!me) return;
    // Wait for invitations to settle before any redirect — otherwise a user
    // with both workspaces *and* a pending invitation gets bounced into their
    // workspace before the panel ever renders.
    if (invitationsLoading) return;
    // Hold the user on Home (don't auto-redirect to a workspace) while there
    // are pending invitations to act on — they should see + decide first.
    if (invitations.length > 0) return;
    if (me.workspaces.length === 0) return; // auto-create runs in the other effect
    const stored = localStorage.getItem(LAST_WORKSPACE_KEY);
    const target = me.workspaces.find((w) => w.slug === stored) ?? me.workspaces[0];
    navigate(`/w/${target.slug}`, { replace: true });
  }, [me, invitationsLoading, invitations.length, navigate]);

  async function onAccept(invitationId: string, wsName: string | null, wsSlug: string | null) {
    try {
      await acceptMutation.mutateAsync(invitationId);
      toast.success(`Joined ${wsName ?? "workspace"}`);
      if (wsSlug) navigate(`/w/${wsSlug}`);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to accept invitation";
      toast.error(detail);
    }
  }

  async function onDecline(invitationId: string) {
    try {
      await declineMutation.mutateAsync(invitationId);
      toast.success("Invitation declined");
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to decline";
      toast.error(detail);
    }
  }

  if (isLoading || !me) {
    return <PageSpinner />;
  }

  const acceptPending = acceptMutation.isPending;
  const declinePending = declineMutation.isPending;

  const invitationsPanel =
    invitations.length > 0 ? (
      <div className="w-full max-w-md space-y-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-neutral-200">
            {invitations.length === 1
              ? "You have a workspace invitation"
              : `You have ${invitations.length} workspace invitations`}
          </h2>
          <p className="text-sm text-slate-500 dark:text-neutral-400">
            Accept to join, or decline to dismiss.
          </p>
        </div>
        <div className="space-y-3">
          {invitations.map((inv) => {
            const inviter =
              inv.invited_by_display_name ??
              inv.invited_by_email ??
              "Someone";
            return (
              <div
                key={inv.id}
                className="rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-neutral-200 truncate">
                      {inv.workspace_name ?? "Workspace"}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-neutral-400">
                      <span className="text-slate-700 dark:text-neutral-300">{inviter}</span> invited
                      you as{" "}
                      <span className="font-medium text-slate-700 dark:text-neutral-300">
                        {inv.role}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      onAccept(inv.id, inv.workspace_name, inv.workspace_slug)
                    }
                    disabled={acceptPending || declinePending}
                  >
                    {acceptPending ? "Joining…" : "Accept"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onDecline(inv.id)}
                    disabled={acceptPending || declinePending}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        {me.workspaces.length > 0 && (
          <button
            type="button"
            className="text-xs text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-100"
            onClick={() => {
              const stored = localStorage.getItem(LAST_WORKSPACE_KEY);
              const target =
                me.workspaces.find((w) => w.slug === stored) ??
                me.workspaces[0];
              navigate(`/w/${target.slug}`);
            }}
          >
            Skip for now →
          </button>
        )}
      </div>
    ) : null;

  if (invitationsPanel) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-neutral-800/40 p-4">
        {invitationsPanel}
      </div>
    );
  }

  if (me.workspaces.length === 0) {
    const firstName = me.display_name?.trim().split(/\s+/)[0] ?? null;
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-neutral-800/40 p-4">
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-0 h-96 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.08),transparent_70%)]"
        />
        <div className="relative w-full max-w-sm rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xl p-6 space-y-5">
          <div className="space-y-1 text-center">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-neutral-200">
              {firstName ? `Welcome, ${firstName}.` : "Welcome."}
            </h1>
            <p className="text-sm text-slate-500 dark:text-neutral-400">
              Create your first workspace to get started.
            </p>
          </div>
          <CreateWorkspaceForm
            autoFocus
            submitLabel="Create workspace"
            onCreated={(ws) => navigate(`/w/${ws.slug}`, { replace: true })}
          />
        </div>
      </div>
    );
  }

  return null;
}
