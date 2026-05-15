import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/api/client";

export type Project = {
  id: string;
  workspace_id: string;
  name: string;
  key: string;
  next_issue_number: number;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectCreate = {
  name: string;
  key: string;
  description?: string;
};

export function useProjects(wsId: string) {
  return useQuery<Project[]>({
    queryKey: ["workspaces", wsId, "projects"],
    queryFn: async () => {
      const { data } = await apiClient.get<Project[]>(
        `/workspaces/${wsId}/projects`,
      );
      return data;
    },
    enabled: !!wsId,
  });
}

export function useCreateProject(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ProjectCreate) => {
      const { data } = await apiClient.post<Project>(
        `/workspaces/${wsId}/projects`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces", wsId, "projects"] });
    },
  });
}
