import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/api/client";

export type SearchResult = {
  type: "project" | "task" | "label" | "goal" | "sprint";
  id: string;
  label: string;
  sublabel: string | null;
  href: string;
};

// Debounce the raw query so each keystroke doesn't fire a request; the fuzzy
// RPC is heavier than the old ILIKE path, so ~200ms keeps it responsive.
function useDebounced(value: string, delayMs = 200): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function useSearch(query: string, workspaceId: string, wsSlug: string) {
  const debouncedQuery = useDebounced(query.trim());
  return useQuery<SearchResult[]>({
    queryKey: ["search", workspaceId, debouncedQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        q: debouncedQuery,
        ws_id: workspaceId,
        ws_slug: wsSlug,
      });
      const { data } = await apiClient.get<SearchResult[]>(
        `/search?${params.toString()}`,
      );
      return data;
    },
    enabled: debouncedQuery.length > 0 && workspaceId.length > 0,
    staleTime: 10_000,
  });
}
