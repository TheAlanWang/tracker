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
  display_name: string | null;
};

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

export function useUpdateMemberRole(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { userId: string; role: WorkspaceRole }) => {
      const { data } = await apiClient.patch<Member>(
        `/workspaces/${wsId}/members/${payload.userId}`,
        { role: payload.role },
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
