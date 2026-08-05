import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

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

export type CommentOrder = "newest" | "oldest";

export type CommentPage = {
  items: Comment[];
  total: number;
  next_cursor: string | null;
};

const COMMENTS_PAGE_SIZE = 30;
const COMMENT_ORDER_KEY = "commentsOrder";

export function loadCommentOrder(): CommentOrder {
  try {
    return localStorage.getItem(COMMENT_ORDER_KEY) === "oldest"
      ? "oldest"
      : "newest";
  } catch {
    return "newest";
  }
}

export function saveCommentOrder(order: CommentOrder): void {
  try {
    localStorage.setItem(COMMENT_ORDER_KEY, order);
  } catch {
    // ignore quota errors
  }
}

export function useComments(taskId: string, order: CommentOrder) {
  return useInfiniteQuery({
    // Order is part of the key: switching order = switching cache bucket,
    // so pages never mix directions. Mutations invalidate the
    // ["tasks", taskId, "comments"] prefix, which matches both buckets.
    queryKey: ["tasks", taskId, "comments", order],
    queryFn: async ({ pageParam }) => {
      const { data } = await apiClient.get<CommentPage>(
        `/tasks/${taskId}/comments`,
        {
          params: {
            limit: COMMENTS_PAGE_SIZE,
            order,
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        },
      );
      return data;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
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
