import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/api/client";

export type Label = {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
  created_at: string;
};

export function useLabels(workspaceId: string) {
  return useQuery<Label[]>({
    queryKey: ["workspaces", workspaceId, "labels"],
    queryFn: async () => {
      const { data } = await apiClient.get<Label[]>(
        `/workspaces/${workspaceId}/labels`,
      );
      return data;
    },
    enabled: !!workspaceId,
  });
}

export function useIssueLabels(issueId: string) {
  return useQuery<Label[]>({
    queryKey: ["issues", issueId, "labels"],
    queryFn: async () => {
      const { data } = await apiClient.get<Label[]>(`/issues/${issueId}/labels`);
      return data;
    },
    enabled: !!issueId,
  });
}

export function useCreateLabel(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; color: string }) => {
      const { data } = await apiClient.post<Label>(
        `/workspaces/${workspaceId}/labels`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces", workspaceId, "labels"] });
    },
  });
}

export function useAttachLabel(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (labelId: string) => {
      await apiClient.post(`/issues/${issueId}/labels/${labelId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issues", issueId, "labels"] });
    },
  });
}

export function useDetachLabel(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (labelId: string) => {
      await apiClient.delete(`/issues/${issueId}/labels/${labelId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issues", issueId, "labels"] });
    },
  });
}
