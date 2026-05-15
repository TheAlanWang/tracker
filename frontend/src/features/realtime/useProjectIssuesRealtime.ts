import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

export function useProjectIssuesRealtime(projectId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!projectId) return;
    const channel = supabase
      .channel(`issues:project_id=${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "issues",
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["projects", projectId, "issues"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, qc]);
}
