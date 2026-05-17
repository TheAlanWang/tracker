// Task watchers — subscribe to a task's lifecycle (comments, status changes)
// independent of being its assignee. Solves "I assigned this away and now I
// can't track it" and "this isn't mine but I care about it".
//
// Server-side: see supabase/migrations/20260529000000_task_watchers.sql.
// Reporter + every assignee are auto-subscribed via DB triggers; users can
// also opt in manually via useWatchTask (Watch button on TaskDetail).
// Notification triggers fan out to all watchers on comment / status change,
// minus the actor.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/api/client";

export type Watcher = {
  task_id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
};

export type WatchedTask = {
  id: string;
  identifier: string;
  title: string;
  status: string;
  priority: string;
  workspace_id: string;
  workspace_slug: string;
  project_id: string;
  project_key: string;
  project_name: string;
  assignee_id: string | null;
  reporter_id: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  watching_since: string;
};

export function useTaskWatchers(taskId: string | null | undefined) {
  return useQuery<Watcher[]>({
    queryKey: ["tasks", taskId, "watchers"],
    queryFn: async () => {
      const { data } = await apiClient.get<Watcher[]>(
        `/tasks/${taskId}/watchers`,
      );
      return data;
    },
    enabled: !!taskId,
  });
}

export function useWatchTask(taskId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!taskId) throw new Error("no task id");
      const { data } = await apiClient.post<Watcher>(
        `/tasks/${taskId}/watchers`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", taskId, "watchers"] });
      qc.invalidateQueries({ queryKey: ["me", "watched-tasks"] });
    },
  });
}

export function useUnwatchTask(taskId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!taskId) throw new Error("no task id");
      await apiClient.delete(`/tasks/${taskId}/watchers/me`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", taskId, "watchers"] });
      qc.invalidateQueries({ queryKey: ["me", "watched-tasks"] });
    },
  });
}

export function useMyWatchedTasks() {
  return useQuery<WatchedTask[]>({
    queryKey: ["me", "watched-tasks"],
    queryFn: async () => {
      const { data } = await apiClient.get<WatchedTask[]>("/me/watched-tasks");
      return data;
    },
  });
}
