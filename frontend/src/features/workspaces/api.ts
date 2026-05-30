import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/api/client";

// Known feature-flag keys. Stored as a sparse map in `workspaces.features`
// (jsonb). Default polarity is per-key:
//   - goals:        missing → OFF (new/experimental layer; owners opt IN)
//   - sprints:      missing → ON  (mature feature; owners opt OUT only)
//   - labels:       missing → ON  (existing data; owners opt OUT only)
//   - dependencies: missing → ON  (existing data; owners opt OUT only)
// Read opt-OUT flags through their is*Enabled() helper rather than
// `!!features?.x` so the default-ON polarity is respected everywhere.
export type WorkspaceFeatures = {
  goals?: boolean;
  sprints?: boolean;
  labels?: boolean;
  dependencies?: boolean;
};

export function isSprintsEnabled(ws: Workspace | undefined | null): boolean {
  // undefined → true; only explicit false hides.
  return ws?.features?.sprints !== false;
}

export function isLabelsEnabled(ws: Workspace | undefined | null): boolean {
  return ws?.features?.labels !== false;
}

export function isDependenciesEnabled(
  ws: Workspace | undefined | null,
): boolean {
  return ws?.features?.dependencies !== false;
}

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  features: WorkspaceFeatures;
  plan: "free" | "pro";
  created_at: string;
  updated_at: string;
};

export type WorkspaceCreate = { name: string; slug: string };
export type WorkspaceUpdate = {
  name?: string;
  // Renaming the slug rewrites every URL in the workspace and breaks
  // external bookmarks / MCP configs. Gate in UI with a confirm dialog.
  slug?: string;
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

// Display-only usage figures for the Plan section. Currently just storage
// (task-image bytes); extensible as more counters land server-side.
export type WorkspaceUsage = { storage_bytes: number };

export function useWorkspaceUsage(wsId: string) {
  return useQuery<WorkspaceUsage>({
    queryKey: ["workspaces", wsId, "usage"],
    queryFn: async () => {
      const { data } = await apiClient.get<WorkspaceUsage>(
        `/workspaces/${wsId}/usage`,
      );
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
