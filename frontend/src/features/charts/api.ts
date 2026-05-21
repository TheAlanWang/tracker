import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/api/client";
import { todayLocalString } from "@/lib/date";

export type BurndownPoint = {
  day: string; // ISO date
  remaining: number;
  ideal: number;
};

export type Burndown = {
  sprint_id: string;
  total: number;
  start: string; // ISO date
  end: string; // ISO date
  points: BurndownPoint[];
};

export type VelocityBar = {
  sprint_id: string;
  sprint_name: string;
  end_at: string | null;
  total: number;
  completed: number;
};

export type Velocity = {
  project_id: string;
  bars: VelocityBar[];
};

export function useBurndown(sprintId: string) {
  // Burndown's "today" cursor must match the viewer's calendar — see
  // useDashboard for the same pattern.
  const today = todayLocalString();
  return useQuery<Burndown>({
    queryKey: ["sprints", sprintId, "burndown", today],
    queryFn: async () => {
      const { data } = await apiClient.get<Burndown>(
        `/sprints/${sprintId}/burndown?today=${encodeURIComponent(today)}`,
      );
      return data;
    },
    enabled: !!sprintId,
    // The 409 "no dates" case shouldn't be retried — there's no transient
    // condition to wait out.
    retry: false,
  });
}

export function useVelocity(projectId: string) {
  return useQuery<Velocity>({
    queryKey: ["projects", projectId, "velocity"],
    queryFn: async () => {
      const { data } = await apiClient.get<Velocity>(
        `/projects/${projectId}/velocity`,
      );
      return data;
    },
    enabled: !!projectId,
  });
}
