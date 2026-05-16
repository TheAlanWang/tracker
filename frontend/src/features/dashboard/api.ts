import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/api/client";

export type DashboardTask = {
  id: string;
  identifier: string;
  title: string;
  status: string;
  workspace_slug: string;
  project_key: string;
  due_date: string | null;
  updated_at: string;
};

export type DashboardSprint = {
  id: string;
  name: string;
  workspace_slug: string;
  project_key: string;
  start_at: string | null;
  end_at: string | null;
};

export type DashboardStats = {
  open: number;
  done_this_week: number;
  overdue: number;
  in_review: number;
};

export type DashboardActivity = {
  id: string;
  task_id: string;
  task_identifier: string;
  task_title: string;
  workspace_slug: string;
  project_key: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type Dashboard = {
  assigned_to_me: DashboardTask[];
  active_sprints: DashboardSprint[];
  due_this_week: DashboardTask[];
  overdue: DashboardTask[];
  stats: DashboardStats;
  recent_activity: DashboardActivity[];
};

export function useDashboard(workspaceId?: string) {
  return useQuery({
    queryKey: ["me", "dashboard", workspaceId ?? "all"],
    queryFn: async () => {
      const qs = workspaceId
        ? `?workspace_id=${encodeURIComponent(workspaceId)}`
        : "";
      const { data } = await apiClient.get<Dashboard>(`/me/dashboard${qs}`);
      return data;
    },
    enabled: workspaceId === undefined || !!workspaceId,
  });
}
