import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/api/client";
import { todayLocalString } from "@/lib/date";

export type DashboardTask = {
  id: string;
  identifier: string;
  title: string;
  status: string;
  workspace_slug: string;
  project_key: string;
  project_name: string;
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
  actor_display_name: string | null;
  actor_avatar_url: string | null;
  actor_avatar_color: string | null;
  action: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type Dashboard = {
  assigned_to_me: DashboardTask[];
  active_sprints: DashboardSprint[];
  due_this_week: DashboardTask[];
  overdue: DashboardTask[];
  done_this_week_tasks: DashboardTask[];
  stats: DashboardStats;
  recent_activity: DashboardActivity[];
};

export function useDashboard(workspaceId?: string) {
  // Compute once per render so React Query's queryKey changes when the
  // user crosses local midnight while the tab is open — the data they
  // see (overdue / due_this_week) is "today"-relative and would otherwise
  // be stale until they manually refetch.
  const today = todayLocalString();
  return useQuery({
    queryKey: ["me", "dashboard", workspaceId ?? "all", today],
    queryFn: async () => {
      const params = new URLSearchParams({ today });
      if (workspaceId) params.set("workspace_id", workspaceId);
      const { data } = await apiClient.get<Dashboard>(
        `/me/dashboard?${params.toString()}`,
      );
      return data;
    },
    enabled: workspaceId === undefined || !!workspaceId,
  });
}
