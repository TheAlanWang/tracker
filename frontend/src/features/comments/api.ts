import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/api/client";

export type Comment = {
  id: string;
  task_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
};

export type CommentCreate = { body: string };
export type CommentUpdate = { body: string };

export function useComments(taskId: string) {
  return useQuery<Comment[]>({
    queryKey: ["tasks", taskId, "comments"],
    queryFn: async () => {
      const { data } = await apiClient.get<Comment[]>(`/tasks/${taskId}/comments`);
      return data;
    },
    enabled: !!taskId,
  });
}

export function useCreateComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CommentCreate) => {
      const { data } = await apiClient.post<Comment>(
        `/tasks/${taskId}/comments`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", taskId, "comments"] });
    },
  });
}

export function useUpdateComment(taskId: string) {
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
      qc.invalidateQueries({ queryKey: ["tasks", taskId, "comments"] });
    },
  });
}

export function useDeleteComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (commentId: string) => {
      await apiClient.delete(`/comments/${commentId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", taskId, "comments"] });
    },
  });
}
