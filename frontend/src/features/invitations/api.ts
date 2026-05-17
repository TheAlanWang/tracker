// Workspace invitations API.
//
// Two perspectives:
//   - Admin (sender): use*WorkspaceInvitations / useCreateInvitation /
//     useRevokeInvitation, used by WorkspaceSettings.
//   - Invitee (receiver): useMyInvitations / useAcceptInvitation /
//     useDeclineInvitation, used by Home, WorkspaceLayout's inbox bell, and
//     Profile Settings.
//
// Backend wiring: see backend/app/services/invitations.py. Inviting an
// email that has no account triggers a Supabase invite email via
// auth.admin.invite_user_by_email; existing-user emails surface via the
// in-app inbox + Home panel on next sign-in. Accept / decline write a
// notification row for the inviter so they see the outcome in their bell
// without a separate email.

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { apiClient } from "@/api/client";

export type InvitationStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "revoked"
  | "expired";

export type Invitation = {
  id: string;
  workspace_id: string;
  workspace_name: string | null;
  workspace_slug: string | null;
  invited_email: string;
  role: "member" | "admin";
  status: InvitationStatus;
  invited_by: string;
  invited_by_email: string | null;
  invited_by_display_name: string | null;
  created_at: string;
  responded_at: string | null;
  expires_at: string;
};

// ── Workspace-scoped (admin) ──

export function useWorkspaceInvitations(wsId: string) {
  return useQuery<Invitation[]>({
    queryKey: ["workspaces", wsId, "invitations"],
    queryFn: async () => {
      const { data } = await apiClient.get<Invitation[]>(
        `/workspaces/${wsId}/invitations`,
      );
      return data;
    },
    enabled: !!wsId,
    // See useMembers — keeps the previous workspace's pending invitations
    // visible during the switch, so the Members card doesn't collapse +
    // reflow under the user's eyes.
    placeholderData: keepPreviousData,
  });
}

export function useCreateInvitation(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      email: string;
      role?: "member" | "admin";
    }) => {
      const { data } = await apiClient.post<Invitation>(
        `/workspaces/${wsId}/invitations`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces", wsId, "invitations"] });
    },
  });
}

export function useRevokeInvitation(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: string) => {
      await apiClient.delete(
        `/workspaces/${wsId}/invitations/${invitationId}`,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces", wsId, "invitations"] });
    },
  });
}

// ── Current user (invitee) ──

export function useMyInvitations() {
  return useQuery<Invitation[]>({
    queryKey: ["me", "invitations"],
    queryFn: async () => {
      const { data } = await apiClient.get<Invitation[]>("/me/invitations");
      return data;
    },
    // Refetch on focus so a fresh invite shows up without needing a full reload.
    refetchOnWindowFocus: true,
  });
}

export function useAcceptInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const { data } = await apiClient.post<Invitation>(
        `/invitations/${invitationId}/accept`,
      );
      return data;
    },
    onSuccess: () => {
      // Joining a workspace changes /me (workspaces list) and the invitation
      // list itself.
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["me", "invitations"] });
      qc.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
}

export function useDeclineInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const { data } = await apiClient.post<Invitation>(
        `/invitations/${invitationId}/decline`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me", "invitations"] });
    },
  });
}
