import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/api/client";

export type NotificationType =
  | "assigned"
  | "mentioned"
  | "commented"
  | "status_changed";

export type Notification = {
  id: string;
  user_id: string;
  type: NotificationType;
  task_id: string;
  actor_id: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export function useNotifications(opts: { unreadOnly?: boolean } = {}) {
  return useQuery<Notification[]>({
    queryKey: ["notifications", { unreadOnly: opts.unreadOnly ?? false }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (opts.unreadOnly) params.set("unread_only", "true");
      const qs = params.toString();
      const { data } = await apiClient.get<Notification[]>(
        `/me/notifications${qs ? `?${qs}` : ""}`,
      );
      return data;
    },
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: string) => {
      await apiClient.post(`/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{ count: number }>(
        "/me/notifications/read-all",
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
