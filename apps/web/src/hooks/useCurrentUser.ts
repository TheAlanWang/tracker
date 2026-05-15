import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/api/client";

export type Me = {
  id: string;
  email: string | null;
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
