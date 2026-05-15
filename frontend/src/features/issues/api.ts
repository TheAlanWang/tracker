import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
}>;

export function useIssues(projectId: string, opts: { status?: IssueStatus } = {}) {
  return useQuery<Issue[]>({
    queryKey: ["projects", projectId, "issues", opts],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (opts.status) params.set("status", opts.status);
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
