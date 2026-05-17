import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/api/client";
import type { Task } from "@/features/tasks/api";

export type GoalStatus = "active" | "achieved" | "paused" | "dropped";

export type Goal = {
  id: string;
  workspace_id: string;
  parent_goal_id: string | null;
  title: string;
  description: string;
  status: GoalStatus;
  position: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  direct_task_count: number;
  descendant_task_count: number;
  done_task_count: number;
};

export type GoalCreate = {
  title: string;
  description?: string;
  parent_goal_id?: string | null;
};

export type GoalUpdate = Partial<{
  title: string;
  description: string;
  status: GoalStatus;
  parent_goal_id: string | null;
  position: number;
}>;

export function useGoals(workspaceId: string) {
  return useQuery<Goal[]>({
    queryKey: ["workspaces", workspaceId, "goals"],
    queryFn: async () => {
      const { data } = await apiClient.get<Goal[]>(
        `/workspaces/${workspaceId}/goals`,
      );
      return data;
    },
    enabled: !!workspaceId,
  });
}

export function useCreateGoal(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: GoalCreate) => {
      const { data } = await apiClient.post<Goal>(
        `/workspaces/${workspaceId}/goals`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces", workspaceId, "goals"] });
    },
  });
}

export function useUpdateGoal(goalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: GoalUpdate) => {
      const { data } = await apiClient.patch<Goal>(
        `/goals/${goalId}`,
        payload,
      );
      return data;
    },
    onSuccess: (goal) => {
      qc.invalidateQueries({
        queryKey: ["workspaces", goal.workspace_id, "goals"],
      });
    },
  });
}

export function useDeleteGoal(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (goalId: string) => {
      await apiClient.delete(`/goals/${goalId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces", workspaceId, "goals"] });
      // Tasks lose their goal_id via FK SET NULL — refresh task caches too.
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useGoalTasks(goalId: string, opts: { recursive?: boolean } = {}) {
  const recursive = opts.recursive ?? false;
  return useQuery<Task[]>({
    queryKey: ["goals", goalId, "tasks", { recursive }],
    queryFn: async () => {
      const { data } = await apiClient.get<Task[]>(
        `/goals/${goalId}/tasks?recursive=${recursive}`,
      );
      return data;
    },
    enabled: !!goalId,
  });
}
