// The task description: click-to-edit with autosave (AutosaveMarkdown).
//
// Owns its own useUpdateTask(task.id) on purpose. React Query builds each
// mutation from the observer's *current* options, so a mutation shared with
// the page would PATCH whatever task the page shows by the time an
// unmount-save fires — after switching tasks, the old task's edit would land
// on the new one. Render it with key={task.id}: one field (and one mutation
// target) per task.

import { AutosaveMarkdown } from "@/components/AutosaveMarkdown";
import { type Task, useUpdateTask } from "@/features/tasks/api";

type Props = {
  task: Task;
  userId?: string;
  onImageClick?: (url: string) => void;
};

export function TaskDescriptionField({ task, userId, onImageClick }: Props) {
  const update = useUpdateTask(task.id);
  return (
    <AutosaveMarkdown
      value={task.description}
      onSave={async (description) => {
        await update.mutateAsync({ description });
      }}
      workspaceId={task.workspace_id}
      userId={userId}
      label="Description"
      placeholder="Add a description… (paste or drop an image)"
      onImageClick={onImageClick}
      minHeight="3rem"
    />
  );
}
