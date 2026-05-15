import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/api/client";

export type ActivityAction =
  | "status_changed"
  | "priority_changed"
  | "assignee_changed"
  | "sprint_changed"
  | "commented"
  | "created";

export type Activity = {
  id: string;
  task_id: string;
  actor_id: string | null;
  action: ActivityAction;
  payload: Record<string, unknown>;
  created_at: string;
};

export function useTaskActivity(taskId: string) {
  return useQuery<Activity[]>({
    queryKey: ["tasks", taskId, "activity"],
    queryFn: async () => {
      const { data } = await apiClient.get<Activity[]>(
        `/tasks/${taskId}/activity`,
      );
      return data;
    },
    enabled: !!taskId,
  });
}
