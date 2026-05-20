// Home — the root route for signed-in users. Three branches:
//   1. Pending invitations → render accept/decline panel (and hold here even
//      if the user already has workspaces — they should decide on the invite
//      before being whisked into their existing workspace).
//   2. No workspaces + no invitations → auto-create a default workspace
//      ("{firstName}'s workspace") with a unique slug suffix, then navigate
//      to it. Shows a "Setting up your workspace…" spinner during the
//      mutation. Avoids forcing a "name your first workspace" form on
//      first-run.
//   3. Has workspaces + no pending invitations → redirect to the last-used
//      workspace (or the first one if no preference saved).
//
// Both auto-redirect and auto-create wait for `useMyInvitations()` to
// resolve — otherwise a brand-new user with a pending invite would have a
// default workspace created behind their back before the invite UI rendered.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { PageSpinner } from "@/components/PageSpinner";
import { Button } from "@/components/ui/button";
import {
  useAcceptInvitation,
  useDeclineInvitation,
  useMyInvitations,
} from "@/features/invitations/api";
import { useCreateWorkspace } from "@/features/workspaces/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { slugifyWorkspace } from "@/lib/slug";

const LAST_WORKSPACE_KEY = "tracker.lastWorkspaceSlug";

// Short random suffix appended to the auto-created workspace's slug so the
// first signup never collides with an existing "my-workspace" elsewhere.
function shortRandomSuffix(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().slice(0, 6);
  }
  return Math.random().toString(36).slice(2, 8);
}

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
  const createMutation = useCreateWorkspace();

  // Auto-create runs at most once per Home mount; the ref guards against
  // re-fires while the mutation is in flight or the data refetches.
  const autoCreateTriggered = useRef(false);
  const [autoCreateError, setAutoCreateError] = useState<string | null>(null);

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

  // First-run: brand-new account with no workspaces and no pending invites.
  // Auto-create a default workspace so the user lands directly in the app
  // instead of facing a "name your first workspace" form.
  useEffect(() => {
    if (!me) return;
    // Wait for /me/invitations to actually respond — otherwise a fresh user
    // with a pending invite gets a workspace auto-created behind their back.
    if (invitationsLoading) return;
    if (invitations.length > 0) return;
    if (me.workspaces.length > 0) return;
    if (autoCreateTriggered.current) return;

    autoCreateTriggered.current = true;
    const firstName = me.display_name?.trim().split(/\s+/)[0] ?? null;
    const name = firstName ? `${firstName}'s workspace` : "My workspace";
    const slug = `${slugifyWorkspace(name)}-${shortRandomSuffix()}`;

    createMutation
      .mutateAsync({ name, slug })
      .then((ws) => {
        navigate(`/w/${ws.slug}`, { replace: true });
      })
      .catch((err: unknown) => {
        const detail =
          (err as { response?: { data?: { detail?: string } } }).response?.data
            ?.detail ?? "We couldn't set up your workspace.";
        setAutoCreateError(detail);
        autoCreateTriggered.current = false;
      });
  }, [me, invitationsLoading, invitations.length, createMutation, navigate]);

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

  function retryAutoCreate() {
    setAutoCreateError(null);
    autoCreateTriggered.current = false;
    // The auto-create effect will re-run on the next render because the ref
    // is reset; we just need to force a re-render. Tiny no-op state bump.
    // Simplest path: navigate to "/" again, which triggers the effect chain.
    navigate("/", { replace: true });
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
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {invitations.length === 1
              ? "You have a workspace invitation"
              : `You have ${invitations.length} workspace invitations`}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
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
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {inv.workspace_name ?? "Workspace"}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                      <span className="text-slate-700 dark:text-slate-300">{inviter}</span> invited
                      you as{" "}
                      <span className="font-medium text-slate-700 dark:text-slate-300">
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
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-800/40 p-4">
        {invitationsPanel}
      </div>
    );
  }

  if (me.workspaces.length === 0) {
    const firstName = me.display_name?.trim().split(/\s+/)[0] ?? null;
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-900 p-4">
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-0 h-96 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.08),transparent_70%)]"
        />
        <div className="relative w-full max-w-sm text-center space-y-5">
          {autoCreateError ? (
            <>
              <div className="mx-auto w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-11.25v4.5a.75.75 0 0 1-1.5 0v-4.5a.75.75 0 0 1 1.5 0ZM10 14a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="space-y-1">
                <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  We hit a snag setting up your workspace.
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">{autoCreateError}</p>
              </div>
              <Button onClick={retryAutoCreate}>Try again</Button>
            </>
          ) : (
            <>
              <div
                className="mx-auto w-10 h-10 rounded-full border-2 border-slate-200 dark:border-slate-800 border-t-slate-900 animate-spin"
                aria-label="Loading"
              />
              <div className="space-y-1">
                <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                  {firstName ? `Welcome, ${firstName}.` : "Welcome."}
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Setting up your workspace…
                </p>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                You can rename it anytime from settings.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return null;
}
