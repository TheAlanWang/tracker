import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/api/client";

export type WorkspaceRole = "owner" | "admin" | "member";

export type Member = {
  user_id: string;
  workspace_id: string;
  role: WorkspaceRole;
  created_at: string;
  email: string | null;
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
  });
}

export function useInviteMember(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { email: string }) => {
      const { data } = await apiClient.post<Member>(
        `/workspaces/${wsId}/members`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces", wsId, "members"] });
    },
  });
}

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
