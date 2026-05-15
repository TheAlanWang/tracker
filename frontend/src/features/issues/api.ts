import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { apiClient } from "@/api/client";

export type IssueStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "in_review"
  | "done"
  | "cancelled";

export type IssuePriority =
  | "no_priority"
  | "urgent"
  | "high"
  | "medium"
  | "low";

export type Issue = {
  id: string;
  workspace_id: string;
  project_id: string;
  sprint_id: string | null;
  parent_id: string | null;
  identifier: string;
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  assignee_id: string | null;
  reporter_id: string | null;
  due_date: string | null; // ISO date
  position: number;
  created_at: string;
  updated_at: string;
};

export type IssueCreate = {
  title: string;
  description?: string;
  status?: IssueStatus;
  priority?: IssuePriority;
  assignee_id?: string | null;
  due_date?: string | null;
};

export type IssueUpdate = Partial<{
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  assignee_id: string | null;
  due_date: string | null;
  sprint_id: string | null;
}>;

export function useWorkspaceIssues(
  workspaceId: string,
  opts: { assigneeId?: string } = {},
) {
  return useQuery<Issue[]>({
    queryKey: ["workspaces", workspaceId, "issues", opts],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (opts.assigneeId) params.set("assignee_id", opts.assigneeId);
      const qs = params.toString();
      const { data } = await apiClient.get<Issue[]>(
        `/workspaces/${workspaceId}/issues${qs ? `?${qs}` : ""}`,
      );
      return data;
    },
    enabled: !!workspaceId,
  });
}

export function useIssues(
  projectId: string,
  opts: { status?: IssueStatus; sprint?: string | "null" } = {},
) {
  return useQuery<Issue[]>({
    queryKey: ["projects", projectId, "issues", opts],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (opts.status) params.set("status", opts.status);
      if (opts.sprint) params.set("sprint", opts.sprint);
      const qs = params.toString();
      const { data } = await apiClient.get<Issue[]>(
        `/projects/${projectId}/issues${qs ? `?${qs}` : ""}`,
      );
      return data;
    },
    enabled: !!projectId,
  });
}

export function useIssue(issueId: string) {
  return useQuery<Issue>({
    queryKey: ["issues", issueId],
    queryFn: async () => {
      const { data } = await apiClient.get<Issue>(`/issues/${issueId}`);
      return data;
    },
    enabled: !!issueId,
  });
}

export type ResolvedIdentifier = {
  workspace_slug: string;
  project_key: string;
  issue_id: string;
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

export function useCreateIssue(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: IssueCreate) => {
      const { data } = await apiClient.post<Issue>(
        `/projects/${projectId}/issues`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", projectId, "issues"] });
    },
  });
}

export function useUpdateIssue(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: IssueUpdate) => {
      const { data } = await apiClient.patch<Issue>(
        `/issues/${issueId}`,
        payload,
      );
      return data;
    },
    onSuccess: (issue) => {
      qc.setQueryData(["issues", issueId], issue);
      // Invalidate any list this issue might appear in
      qc.invalidateQueries({
        queryKey: ["projects", issue.project_id, "issues"],
      });
    },
  });
}

export function useDeleteIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (issueId: string) => {
      await apiClient.delete(`/issues/${issueId}`);
    },
    onSuccess: () => {
      // Issues lists across projects might need invalidating, but in Plan 3
      // the delete is always called from within a project context.
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useMoveIssue(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      issueId: string;
      status: IssueStatus;
      position: number;
    }) => {
      const { data } = await apiClient.post<Issue>(
        `/issues/${args.issueId}/move`,
        { status: args.status, position: args.position },
      );
      return data;
    },
    onMutate: async (args) => {
      // Snapshot all issues queries for this project (any status filter variant)
      await qc.cancelQueries({ queryKey: ["projects", projectId, "issues"] });
      const snapshot = qc.getQueriesData<Issue[]>({
        queryKey: ["projects", projectId, "issues"],
      });
      // Update each cached list: mutate the issue in place
      qc.setQueriesData<Issue[]>(
        { queryKey: ["projects", projectId, "issues"] },
        (old) => {
          if (!old) return old;
          return old.map((i) =>
            i.id === args.issueId
              ? { ...i, status: args.status, position: args.position }
              : i,
          );
        },
      );
      return { snapshot };
    },
    onError: (_err, _args, ctx) => {
      ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error("Failed to move issue");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["projects", projectId, "issues"] });
    },
  });
}
