import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/api/client";

export type ChecklistItem = {
  id: string;
  task_id: string;
  text: string;
  done: boolean;
  position: number;
  created_at: string;
  updated_at: string;
};

export function useChecklist(taskId: string) {
  return useQuery<ChecklistItem[]>({
    queryKey: ["tasks", taskId, "checklist"],
    queryFn: async () => {
      const { data } = await apiClient.get<ChecklistItem[]>(
        `/tasks/${taskId}/checklist`,
      );
      return data;
    },
    enabled: !!taskId,
  });
}

export function useCreateChecklistItem(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (text: string) => {
      const { data } = await apiClient.post<ChecklistItem>(
        `/tasks/${taskId}/checklist`,
        { text },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", taskId, "checklist"] });
    },
  });
}

export function useUpdateChecklistItem(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      itemId: string;
      payload: Partial<{ text: string; done: boolean; position: number }>;
    }) => {
      const { data } = await apiClient.patch<ChecklistItem>(
        `/checklist/${args.itemId}`,
        args.payload,
      );
      return data;
    },
    // Optimistic — toggling a checkbox should feel instant.
    onMutate: async (args) => {
      await qc.cancelQueries({ queryKey: ["tasks", taskId, "checklist"] });
      const prev = qc.getQueryData<ChecklistItem[]>([
        "tasks",
        taskId,
        "checklist",
      ]);
      if (prev) {
        qc.setQueryData<ChecklistItem[]>(
          ["tasks", taskId, "checklist"],
          prev.map((it) =>
            it.id === args.itemId ? { ...it, ...args.payload } : it,
          ),
        );
      }
      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(["tasks", taskId, "checklist"], ctx.prev);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["tasks", taskId, "checklist"] });
    },
  });
}

export function useDeleteChecklistItem(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      await apiClient.delete(`/checklist/${itemId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", taskId, "checklist"] });
    },
  });
}
