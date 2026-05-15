import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/api/client";

export type Me = {
  id: string;
  email: string | null;
  display_name: string | null;
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

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { display_name?: string }) => {
      const { data } = await apiClient.patch<Me>("/me/profile", payload);
      return data;
    },
    onSuccess: (me) => {
      qc.setQueryData(["me"], me);
    },
  });
}
