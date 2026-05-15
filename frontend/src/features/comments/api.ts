import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/api/client";

export type Comment = {
  id: string;
  issue_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
};

export type CommentCreate = { body: string };
export type CommentUpdate = { body: string };

export function useComments(issueId: string) {
  return useQuery<Comment[]>({
    queryKey: ["issues", issueId, "comments"],
    queryFn: async () => {
      const { data } = await apiClient.get<Comment[]>(`/issues/${issueId}/comments`);
      return data;
    },
    enabled: !!issueId,
  });
}

export function useCreateComment(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CommentCreate) => {
      const { data } = await apiClient.post<Comment>(
        `/issues/${issueId}/comments`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issues", issueId, "comments"] });
    },
  });
}

export function useUpdateComment(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { commentId: string; body: string }) => {
      const { data } = await apiClient.patch<Comment>(
        `/comments/${args.commentId}`,
        { body: args.body },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issues", issueId, "comments"] });
    },
  });
}

export function useDeleteComment(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (commentId: string) => {
      await apiClient.delete(`/comments/${commentId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issues", issueId, "comments"] });
    },
  });
}
