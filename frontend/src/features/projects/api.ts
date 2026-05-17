import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/api/client";

export type Project = {
  id: string;
  workspace_id: string;
  name: string;
  key: string;
  next_task_number: number;
  description: string | null;
  // Optional hex color (#RRGGBB) for the sidebar dot. When null we fall
  // back to a hash-derived hue from the key so existing projects keep
  // their identity without a backfill.
  color: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectCreate = {
  name: string;
  // Optional — backend derives a unique key from name when omitted.
  key?: string;
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

export type ProjectUpdate = {
  name?: string;
  description?: string | null;
  // Changing the key bulk-renames every existing task identifier in the
  // project (OLD-N → NEW-N), atomic via the rename_project_key RPC.
  key?: string;
  // Hex color for the sidebar dot. "" clears the override.
  color?: string;
};

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

export function useUpdateProject(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      payload,
    }: {
      projectId: string;
      payload: ProjectUpdate;
    }) => {
      const { data } = await apiClient.patch<Project>(
        `/projects/${projectId}`,
        payload,
      );
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["workspaces", wsId, "projects"] });
      // A key rename rewrites every task identifier in the project, so the
      // cached task list / individual tasks / dashboard / activity feed all
      // need to refetch. Cheap blanket invalidation — the alternative is
      // tracking every query key that might surface an identifier.
      qc.invalidateQueries({ queryKey: ["projects", vars.projectId, "tasks"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["me", "dashboard"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}

export function useDeleteProject(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string) => {
      await apiClient.delete(`/projects/${projectId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces", wsId, "projects"] });
    },
  });
}
