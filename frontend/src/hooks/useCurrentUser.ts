import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/api/client";

export type Me = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  workspaces: { id: string; slug: string; name: string }[];
};

export function useCurrentUser() {
  return useQuery<Me>({
    queryKey: ["me"],
    queryFn: async () => {
      const { data } = await apiClient.get<Me>("/me");
      return data;
    },
    staleTime: 1000 * 60 * 5,
  });
}

// avatar_url: pass a non-empty URL to set, "" to clear, undefined to leave
// untouched. display_name follows the same convention.
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      display_name?: string;
      avatar_url?: string;
    }) => {
      const { data } = await apiClient.patch<Me>("/me/profile", payload);
      return data;
    },
    onSuccess: (me) => {
      qc.setQueryData(["me"], me);
    },
  });
}

// Permanently delete the current user. The backend handles all cascade
// cleanup via existing FK constraints; caller is responsible for signing
// out + navigating away after this resolves.
export function useDeleteAccount() {
  return useMutation({
    mutationFn: async () => {
      await apiClient.delete("/me");
    },
  });
}
