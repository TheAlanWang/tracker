import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { apiClient } from "@/api/client";

export type TaskStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "in_review"
  | "done"
  | "cancelled";

export type TaskPriority =
  | "no_priority"
  | "urgent"
  | "high"
  | "medium"
  | "low";

export type Task = {
  id: string;
  workspace_id: string;
  project_id: string;
  sprint_id: string | null;
  parent_id: string | null;
  goal_id: string | null;
  identifier: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string | null;
  reporter_id: string | null;
  due_date: string | null; // ISO date
  position: number;
  created_at: string;
  updated_at: string;
};

export type TaskCreate = {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignee_id?: string | null;
  due_date?: string | null;
};

export type TaskUpdate = Partial<{
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string | null;
  due_date: string | null;
  sprint_id: string | null;
  goal_id: string | null;
}>;

export function useWorkspaceTasks(
  workspaceId: string,
  opts: { assigneeId?: string } = {},
) {
  return useQuery<Task[]>({
    queryKey: ["workspaces", workspaceId, "tasks", opts],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (opts.assigneeId) params.set("assignee_id", opts.assigneeId);
      const qs = params.toString();
      const { data } = await apiClient.get<Task[]>(
        `/workspaces/${workspaceId}/tasks${qs ? `?${qs}` : ""}`,
      );
      return data;
    },
    enabled: !!workspaceId,
  });
}

export function useTasks(
  projectId: string,
  opts: { status?: TaskStatus; sprint?: string | "null" } = {},
) {
  return useQuery<Task[]>({
    queryKey: ["projects", projectId, "tasks", opts],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (opts.status) params.set("status", opts.status);
      if (opts.sprint) params.set("sprint", opts.sprint);
      const qs = params.toString();
      const { data } = await apiClient.get<Task[]>(
        `/projects/${projectId}/tasks${qs ? `?${qs}` : ""}`,
      );
      return data;
    },
    enabled: !!projectId,
  });
}

export function useTask(taskId: string) {
  return useQuery<Task>({
    queryKey: ["tasks", taskId],
    queryFn: async () => {
      const { data } = await apiClient.get<Task>(`/tasks/${taskId}`);
      return data;
    },
    enabled: !!taskId,
  });
}

export type ResolvedIdentifier = {
  workspace_slug: string;
  project_key: string;
  task_id: string;
  identifier: string;
};

export function useResolveIdentifier(identifier: string) {
  return useQuery<ResolvedIdentifier>({
    queryKey: ["resolve", identifier],
    queryFn: async () => {
      const { data } = await apiClient.get<ResolvedIdentifier>(
        `/resolve/identifier/${identifier}`,
      );
      return data;
    },
    enabled: !!identifier,
    retry: false,
  });
}

export function useCreateTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TaskCreate) => {
      const { data } = await apiClient.post<Task>(
        `/projects/${projectId}/tasks`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", projectId, "tasks"] });
    },
  });
}

export function useUpdateTask(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TaskUpdate) => {
      const { data } = await apiClient.patch<Task>(
        `/tasks/${taskId}`,
        payload,
      );
      return data;
    },
    onSuccess: (task) => {
      qc.setQueryData(["tasks", taskId], task);
      // Invalidate any list this task might appear in
      qc.invalidateQueries({
        queryKey: ["projects", task.project_id, "tasks"],
      });
      // Activity log gets a new row on every UPDATE (via trigger) — refetch
      qc.invalidateQueries({ queryKey: ["tasks", taskId, "activity"] });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      await apiClient.delete(`/tasks/${taskId}`);
    },
    onSuccess: () => {
      // Task lists across projects might need invalidating, but in Plan 3
      // the delete is always called from within a project context.
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useMoveTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      taskId: string;
      status: TaskStatus;
      position: number;
    }) => {
      const { data } = await apiClient.post<Task>(
        `/tasks/${args.taskId}/move`,
        { status: args.status, position: args.position },
      );
      return data;
    },
    onMutate: async (args) => {
      // Snapshot all tasks queries for this project (any status filter variant)
      await qc.cancelQueries({ queryKey: ["projects", projectId, "tasks"] });
      const snapshot = qc.getQueriesData<Task[]>({
        queryKey: ["projects", projectId, "tasks"],
      });
      // Update each cached list: mutate the task in place
      qc.setQueriesData<Task[]>(
        { queryKey: ["projects", projectId, "tasks"] },
        (old) => {
          if (!old) return old;
          return old.map((t) =>
            t.id === args.taskId
              ? { ...t, status: args.status, position: args.position }
              : t,
          );
        },
      );
      return { snapshot };
    },
    onError: (_err, _args, ctx) => {
      ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error("Failed to move task");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["projects", projectId, "tasks"] });
    },
  });
}
