import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/api/client";

export type DashboardIssue = {
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

export type Dashboard = {
  assigned_to_me: DashboardIssue[];
  active_sprints: DashboardSprint[];
  due_this_week: DashboardIssue[];
};

export function useDashboard() {
  return useQuery({
    queryKey: ["me", "dashboard"],
    queryFn: async () =>
      (await apiClient.get<Dashboard>("/me/dashboard")).data,
  });
}
