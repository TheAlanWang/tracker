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
  issue_id: string;
  actor_id: string | null;
  action: ActivityAction;
  payload: Record<string, unknown>;
  created_at: string;
};

export function useIssueActivity(issueId: string) {
  return useQuery<Activity[]>({
    queryKey: ["issues", issueId, "activity"],
    queryFn: async () => {
      const { data } = await apiClient.get<Activity[]>(
        `/issues/${issueId}/activity`,
      );
      return data;
    },
    enabled: !!issueId,
  });
}
