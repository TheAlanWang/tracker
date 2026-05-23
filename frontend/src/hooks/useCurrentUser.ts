import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/api/client";

export type Me = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  avatar_color: string | null;
  // True if auth.users.encrypted_password is set. Source of truth for
  // "should the Profile Settings password row say Set or Change". DON'T
  // use the identities array for this — Supabase doesn't add an email
  // identity when an OAuth user calls updateUser({ password }), so an
  // identities-based check stays stuck on "Set" forever after a password
  // is added.
  has_password: boolean;
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

// avatar_url / avatar_color: pass a non-empty string to set, "" to clear,
// undefined to leave untouched. display_name follows the same convention.
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      display_name?: string;
      avatar_url?: string;
      avatar_color?: string;
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
