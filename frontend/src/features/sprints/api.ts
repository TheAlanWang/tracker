import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/api/client";

export type SprintStatus = "planned" | "active" | "completed";

export type Sprint = {
  id: string;
  project_id: string;
  name: string;
  status: SprintStatus;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SprintCreate = {
  name: string;
  start_at?: string | null;
  end_at?: string | null;
};

export type SprintUpdate = Partial<{
  name: string;
  start_at: string | null;
  end_at: string | null;
}>;

export type CompleteSprintResult = {
  completed: string;
  rolled_over_to: string | null;
  count: number;
};

export function useSprints(projectId: string) {
  return useQuery<Sprint[]>({
    queryKey: ["projects", projectId, "sprints"],
    queryFn: async () => {
      const { data } = await apiClient.get<Sprint[]>(
        `/projects/${projectId}/sprints`,
      );
      return data;
    },
    enabled: !!projectId,
  });
}

export function useSprint(sprintId: string) {
  return useQuery<Sprint>({
    queryKey: ["sprints", sprintId],
    queryFn: async () => {
      const { data } = await apiClient.get<Sprint>(`/sprints/${sprintId}`);
      return data;
    },
    enabled: !!sprintId,
  });
}

export function useCreateSprint(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SprintCreate) => {
      const { data } = await apiClient.post<Sprint>(
        `/projects/${projectId}/sprints`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", projectId, "sprints"] });
    },
  });
}

export function useUpdateSprint(sprintId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SprintUpdate) => {
      const { data } = await apiClient.patch<Sprint>(
        `/sprints/${sprintId}`,
        payload,
      );
      return data;
    },
    onSuccess: (s) => {
      qc.setQueryData(["sprints", sprintId], s);
      qc.invalidateQueries({
        queryKey: ["projects", s.project_id, "sprints"],
      });
    },
  });
}

export function useDeleteSprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sprintId: string) => {
      await apiClient.delete(`/sprints/${sprintId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useStartSprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sprintId: string) => {
      const { data } = await apiClient.post<Sprint>(`/sprints/${sprintId}/start`);
      return data;
    },
    onSuccess: (s) => {
      qc.setQueryData(["sprints", s.id], s);
      qc.invalidateQueries({
        queryKey: ["projects", s.project_id, "sprints"],
      });
    },
  });
}

export function useCompleteSprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sprintId: string) => {
      const { data } = await apiClient.post<CompleteSprintResult>(
        `/sprints/${sprintId}/complete`,
      );
      return data;
    },
    onSuccess: () => {
      // Both sprint list and tasks lists in the project are affected
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["sprints"] });
    },
  });
}
