import { useMemo } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { apiClient } from "@/api/client";

export type WorkspaceRole = "owner" | "admin" | "member";

export type Member = {
  user_id: string;
  workspace_id: string;
  role: WorkspaceRole;
  created_at: string;
  email: string | null;
  // Effective name in this workspace: the workspace nickname if set, else
  // the user's own display_name.
  display_name: string | null;
  avatar_url: string | null;
  avatar_color: string | null;
  // Raw workspace nickname (null = not set) and the user's own name — only
  // the members settings page needs these, to edit the nickname.
  nickname: string | null;
  profile_display_name: string | null;
};

// `user_id -> Member` lookup, built once per `members` change instead of
// each page re-implementing the same `Map` construction.
export function useMemberById(members: Member[]): Map<string, Member> {
  return useMemo(
    () => new Map(members.map((m) => [m.user_id, m])),
    [members],
  );
}

export function useMembers(wsId: string) {
  return useQuery<Member[]>({
    queryKey: ["workspaces", wsId, "members"],
    queryFn: async () => {
      const { data } = await apiClient.get<Member[]>(
        `/workspaces/${wsId}/members`,
      );
      return data;
    },
    enabled: !!wsId,
    // Keep the previous workspace's member rows visible while the new
    // workspace's data loads — avoids a "Loading…" flash + layout jump in
    // Workspace Settings when switching between workspaces.
    placeholderData: keepPreviousData,
  });
}

// Inviting a user no longer adds them directly — use useCreateInvitation
// from @/features/invitations/api instead.

// PATCH a member: send only what changes. `nickname: null` clears it.
export function useUpdateMember(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      ...changes
    }: {
      userId: string;
      role?: WorkspaceRole;
      nickname?: string | null;
    }) => {
      const { data } = await apiClient.patch<Member>(
        `/workspaces/${wsId}/members/${userId}`,
        changes,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces", wsId, "members"] });
    },
  });
}

export function useRemoveMember(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      await apiClient.delete(`/workspaces/${wsId}/members/${userId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces", wsId, "members"] });
    },
  });
}

export function useTransferOwnership(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      await apiClient.post(
        `/workspaces/${wsId}/members/${userId}/transfer-ownership`,
      );
    },
    onSuccess: () => {
      // members: roles changed. workspaces: owner_id changed, so the
      // caller's isOwner (and owner-only UI) must recompute everywhere.
      qc.invalidateQueries({ queryKey: ["workspaces", wsId, "members"] });
      qc.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
}
