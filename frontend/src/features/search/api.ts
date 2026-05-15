import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/api/client";

export type SearchResult = {
  type: "project" | "issue" | "label";
  id: string;
  label: string;
  sublabel: string | null;
  href: string;
};

export function useSearch(query: string, workspaceId: string, wsSlug: string) {
  return useQuery<SearchResult[]>({
    queryKey: ["search", workspaceId, query],
    queryFn: async () => {
      const params = new URLSearchParams({
        q: query,
        ws_id: workspaceId,
        ws_slug: wsSlug,
      });
      const { data } = await apiClient.get<SearchResult[]>(
        `/search?${params.toString()}`,
      );
      return data;
    },
    enabled: query.trim().length > 0 && workspaceId.length > 0,
    staleTime: 10_000,
  });
}
