import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/api/client";

// Known feature-flag keys. Stored as a sparse map in `workspaces.features`
// (jsonb) — a missing key means "off". Owners flip these in Workspace
// Settings to opt their team into in-progress / experimental UI.
export type WorkspaceFeatures = {
  goals?: boolean;
};

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  features: WorkspaceFeatures;
  created_at: string;
  updated_at: string;
};

export type WorkspaceCreate = { name: string; slug: string };
export type WorkspaceUpdate = {
  name?: string;
  // Partial merge — only keys you send are changed.
  features?: WorkspaceFeatures;
};

export function useWorkspaces() {
  return useQuery<Workspace[]>({
    queryKey: ["workspaces"],
    queryFn: async () => {
      const { data } = await apiClient.get<Workspace[]>("/workspaces");
      return data;
    },
  });
}

export function useWorkspace(wsId: string) {
  return useQuery<Workspace>({
    queryKey: ["workspaces", wsId],
    queryFn: async () => {
      const { data } = await apiClient.get<Workspace>(`/workspaces/${wsId}`);
      return data;
    },
    enabled: !!wsId,
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: WorkspaceCreate) => {
      const { data } = await apiClient.post<Workspace>("/workspaces", payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

export function useUpdateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { wsId: string; payload: WorkspaceUpdate }) => {
      const { data } = await apiClient.patch<Workspace>(
        `/workspaces/${args.wsId}`,
        args.payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

export function useDeleteWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (wsId: string) => {
      await apiClient.delete(`/workspaces/${wsId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}
