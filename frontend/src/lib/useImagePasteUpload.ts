// Shared image paste / drag-drop upload for the live Markdown editor — used
// by the task description, the project description and the comment
// composers (new + edit). Drops an optimistic `![uploading…]()` placeholder
// at the cursor, uploads the file to the task-images bucket, then swaps the
// placeholder for the real `task-image:` reference (or removes it on
// failure). Rendering of that reference is handled by <TaskImage>.
//
// Returns the dragging flag (for the "Drop image to upload" overlay), the
// drag handlers for the wrapper element, `onImageFiles` for the editor, and
// `pending` / `settled()` so autosave can wait for uploads to finish
// instead of saving a placeholder.

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import type { LiveMarkdownEditorHandle } from "@/components/LiveMarkdownEditor";
import { uploadTaskImage } from "@/lib/uploadTaskImage";

type Options = {
  // Undefined while the task / current user is still loading; uploads
  // no-op until both are known so callers can pass task?.workspace_id /
  // me?.id without guarding at the call site.
  workspaceId: string | undefined;
  userId: string | undefined;
  editor: React.RefObject<LiveMarkdownEditorHandle | null>;
};

export type ImagePasteUpload = {
  dragging: boolean;
  /** Uploads in flight. */
  pending: number;
  /** Resolves once every upload started so far has finished (either way). */
  settled: () => Promise<void>;
  onImageFiles: (files: File[]) => void;
  dropHandlers: {
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: () => void;
    onDrop: () => void;
  };
};

export function useImagePasteUpload({ workspaceId, userId, editor }: Options): ImagePasteUpload {
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(0);
  const inflight = useRef(new Set<Promise<void>>());

  const handleFile = useCallback(
    async (file: File) => {
      if (!workspaceId || !userId) return;
      // Optimistic placeholder so multi-paste in quick succession doesn't
      // race; we swap it for the real URL when upload finishes, or drop it
      // entirely on error.
      const placeholder = `![uploading ${file.name}…]()`;
      editor.current?.insertAtCursor(placeholder + "\n");
      try {
        const url = await uploadTaskImage(file, workspaceId, userId);
        editor.current?.replaceText(placeholder, `![${file.name}](${url})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to upload image";
        toast.error(msg);
        editor.current?.replaceText(placeholder + "\n", "");
      }
    },
    [workspaceId, userId, editor],
  );

  const onImageFiles = useCallback(
    (files: File[]) => {
      setDragging(false);
      for (const f of files) {
        const p = handleFile(f).finally(() => {
          inflight.current.delete(p);
          setPending(inflight.current.size);
        });
        inflight.current.add(p);
      }
      setPending(inflight.current.size);
    },
    [handleFile],
  );

  const settled = useCallback(async () => {
    while (inflight.current.size) await Promise.allSettled([...inflight.current]);
  }, []);

  const dropHandlers = {
    onDragOver: useCallback((e: React.DragEvent) => {
      if (e.dataTransfer.types.includes("Files")) setDragging(true);
    }, []),
    // The editor handles the drop itself (onImageFiles); this only clears the overlay.
    onDragLeave: useCallback(() => setDragging(false), []),
    onDrop: useCallback(() => setDragging(false), []),
  };

  return { dragging, pending, settled, onImageFiles, dropHandlers };
}
