import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { apiClient } from "@/api/client";
import type { Member } from "@/features/members/api";

// Fires the "📧 Emailed X about FRO-N" toast when the backend's mutation
// response carries an email_notified_assignee_id. Resolves the recipient's
// display name from React Query's members cache — the cache is warm
// whenever the user has been in any list / board view, which is the path
// they almost certainly came from. On a cold cache (rare — direct task
// URL load), falls back to a generic "the assignee" so the toast is still
// useful.
function notifyEmailScheduled(qc: QueryClient, task: Task) {
  if (!task.email_notified_assignee_id) return;
  const members =
    qc.getQueryData<Member[]>(["workspaces", task.workspace_id, "members"]) ??
    [];
  const m = members.find((x) => x.user_id === task.email_notified_assignee_id);
  const name = m?.display_name?.trim() || m?.email || "the assignee";
  toast.success(`Emailed ${name} about ${task.identifier}`, { icon: "📧" });
}

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
  // ISO timestamp when the task was archived (hidden from main views).
  // null = active. Independent of status — a `done` task can be either
  // archived or active, and only archived ones appear in the Archive tab.
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  // Set on create / update responses when the mutation triggered an
  // assignment-notification email. The mutation hooks use this to toast
  // "Emailed <name> about <identifier>" so the actor gets immediate
  // confirmation that an email went out. Always null on GET responses.
  email_notified_assignee_id?: string | null;
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
  // Boolean flag; backend translates true → archived_at = now(),
  // false → archived_at = null. Don't send a raw archived_at value.
  archived: boolean;
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
  opts: {
    status?: TaskStatus;
    sprint?: string | "null";
    // Default false (active). Archive tab passes true to request the
    // complement set. The queryKey includes opts, so React Query keeps
    // active and archived flavours cached independently.
    archived?: boolean;
  } = {},
) {
  return useQuery<Task[]>({
    queryKey: ["projects", projectId, "tasks", opts],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (opts.status) params.set("status", opts.status);
      if (opts.sprint) params.set("sprint", opts.sprint);
      if (opts.archived) params.set("archived", "true");
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
    onSuccess: (task) => {
      // Write the created task straight into every cached list variant it
      // belongs to, so it shows the moment the POST returns — no second
      // GET round-trip. useTasks keys are ["projects", id, "tasks", opts]
      // where opts is { status?, sprint?, archived? }; skip variants the
      // new (active, unfiltered) task doesn't match.
      const variants = qc.getQueriesData<Task[]>({
        queryKey: ["projects", projectId, "tasks"],
      });
      for (const [key, list] of variants) {
        if (!list) continue;
        const opts = (key[3] ?? {}) as {
          status?: TaskStatus;
          sprint?: string;
          archived?: boolean;
        };
        if (opts.archived) continue; // new task is active (archived_at null)
        if (opts.status && opts.status !== task.status) continue;
        if (opts.sprint === "null" && task.sprint_id !== null) continue;
        if (
          opts.sprint &&
          opts.sprint !== "null" &&
          opts.sprint !== task.sprint_id
        )
          continue;
        if (list.some((t) => t.id === task.id)) continue; // dedupe realtime race
        // Order is moot — Board sorts by position, List by created_at.
        qc.setQueryData<Task[]>(key, [task, ...list]);
      }
      notifyEmailScheduled(qc, task);
    },
    onSettled: () => {
      // Background reconcile (mirrors useMoveTask). The task is already
      // visible from the cache write above, so this refetch is silent — it
      // just corrects ordering/edge cases and covers a dropped realtime
      // connection.
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
      notifyEmailScheduled(qc, task);
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
