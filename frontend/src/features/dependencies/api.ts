// Task dependency hooks — "A blocks B" relationships.
//
// Two directions surface on each task:
//   - blockers  : tasks this one is *waiting on*  ("blocked by")
//   - blocking  : tasks this one is *holding up*  ("blocks")
//
// Each entry carries the dependency row id so the frontend can DELETE
// it directly without a (blocker, blocked) pair lookup roundtrip.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/api/client";
import type { Task } from "@/features/tasks/api";

export type DependencyLink = {
  dependency_id: string;
  task: Task;
};

export type TaskDependencies = {
  blockers: DependencyLink[];
  blocking: DependencyLink[];
};

export function useDependencies(taskId: string) {
  return useQuery<TaskDependencies>({
    queryKey: ["tasks", taskId, "dependencies"],
    queryFn: async () => {
      const { data } = await apiClient.get<TaskDependencies>(
        `/tasks/${taskId}/dependencies`,
      );
      return data;
    },
    enabled: !!taskId,
  });
}

export function useCreateDependency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      blocker_task_id: string;
      blocked_task_id: string;
    }) => {
      const { data } = await apiClient.post(`/dependencies`, payload);
      return data;
    },
    onSuccess: (_dep, vars) => {
      // Both endpoints surface this new edge — refresh both.
      qc.invalidateQueries({
        queryKey: ["tasks", vars.blocker_task_id, "dependencies"],
      });
      qc.invalidateQueries({
        queryKey: ["tasks", vars.blocked_task_id, "dependencies"],
      });
      // The workspace blocked-set also changes when an edge is added.
      qc.invalidateQueries({
        queryKey: ["workspaces"],
        predicate: (q) =>
          Array.isArray(q.queryKey) && q.queryKey.includes("blocked-tasks"),
      });
    },
  });
}

// Workspace-scoped set of task ids that currently have at least one
// open blocker (status not in done/cancelled). Cached so Board / List /
// Backlog cards can render the "Blocked" badge without per-task lookups.
export function useBlockedTaskIds(workspaceId: string) {
  return useQuery<Set<string>>({
    queryKey: ["workspaces", workspaceId, "blocked-tasks"],
    queryFn: async () => {
      const { data } = await apiClient.get<string[]>(
        `/workspaces/${workspaceId}/blocked-tasks`,
      );
      return new Set(data);
    },
    enabled: !!workspaceId,
    // Cheap to keep relatively fresh — invalidated on dep create/delete
    // and on task status changes via the existing patterns.
    staleTime: 30_000,
  });
}

export function useDeleteDependency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (depId: string) => {
      await apiClient.delete(`/dependencies/${depId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["tasks"],
        predicate: (q) =>
          Array.isArray(q.queryKey) && q.queryKey.includes("dependencies"),
      });
      qc.invalidateQueries({
        queryKey: ["workspaces"],
        predicate: (q) =>
          Array.isArray(q.queryKey) && q.queryKey.includes("blocked-tasks"),
      });
    },
  });
}
