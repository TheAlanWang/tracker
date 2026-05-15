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

export function useTaskLabels(taskId: string) {
  return useQuery<Label[]>({
    queryKey: ["tasks", taskId, "labels"],
    queryFn: async () => {
      const { data } = await apiClient.get<Label[]>(`/tasks/${taskId}/labels`);
      return data;
    },
    enabled: !!taskId,
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

export function useAttachLabel(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (labelId: string) => {
      await apiClient.post(`/tasks/${taskId}/labels/${labelId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", taskId, "labels"] });
    },
  });
}

export function useDetachLabel(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (labelId: string) => {
      await apiClient.delete(`/tasks/${taskId}/labels/${labelId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", taskId, "labels"] });
    },
  });
}

export function useDeleteLabel(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (labelId: string) => {
      await apiClient.delete(`/labels/${labelId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces", workspaceId, "labels"] });
    },
  });
}
