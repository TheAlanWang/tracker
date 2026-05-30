// Shared image paste / drag-drop upload for markdown textareas — used by
// the task description editor and the comment composers (new + edit). It
// mirrors the original inline description handlers: drop an optimistic
// `![uploading…]()` placeholder at the caret, upload the file to the
// task-images bucket, then swap the placeholder for the real `task-image:`
// reference (or remove it on failure). Rendering of that reference is
// handled downstream by <TaskImage>.
//
// Returns the dragging flag (for the "Drop image to upload" overlay) plus
// the four textarea event handlers, ready to spread onto a <textarea> or
// <MentionTextarea>.

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { uploadTaskImage } from "@/lib/uploadTaskImage";

type Options = {
  // Undefined while the task / current user is still loading; handleFile
  // no-ops until both are known so callers can pass task?.workspace_id /
  // me?.id without guarding at the call site.
  workspaceId: string | undefined;
  userId: string | undefined;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  setDraft: React.Dispatch<React.SetStateAction<string>>;
};

export type ImagePasteHandlers = {
  dragging: boolean;
  onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onDrop: (e: React.DragEvent<HTMLTextAreaElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLTextAreaElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLTextAreaElement>) => void;
};

export function useImagePasteUpload({
  workspaceId,
  userId,
  textareaRef,
  setDraft,
}: Options): ImagePasteHandlers {
  const [dragging, setDragging] = useState(false);

  // Insert text at the textarea's caret (or append if the ref is gone).
  const insertAtCaret = useCallback(
    (snippet: string) => {
      const ta = textareaRef.current;
      if (!ta) {
        setDraft((d) => d + snippet);
        return;
      }
      const start = ta.selectionStart ?? 0;
      const end = ta.selectionEnd ?? 0;
      setDraft((d) => d.slice(0, start) + snippet + d.slice(end));
      requestAnimationFrame(() => {
        ta.focus();
        const pos = start + snippet.length;
        ta.setSelectionRange(pos, pos);
      });
    },
    [textareaRef, setDraft],
  );

  const handleFile = useCallback(
    async (file: File) => {
      if (!workspaceId || !userId) return;
      // Optimistic placeholder so multi-paste in quick succession doesn't
      // race; we swap it for the real URL when upload finishes, or drop it
      // entirely on error.
      const placeholder = `![uploading ${file.name}…]()`;
      insertAtCaret(placeholder + "\n");
      try {
        const url = await uploadTaskImage(file, workspaceId, userId);
        setDraft((d) => d.replace(placeholder, `![${file.name}](${url})`));
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to upload image";
        toast.error(msg);
        setDraft((d) => d.replace(placeholder + "\n", ""));
      }
    },
    [workspaceId, userId, insertAtCaret, setDraft],
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const files = Array.from(e.clipboardData.files).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length === 0) return; // text / non-image paste falls through
      e.preventDefault();
      files.forEach((f) => void handleFile(f));
    },
    [handleFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLTextAreaElement>) => {
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("image/"),
      );
      setDragging(false);
      if (files.length === 0) return;
      e.preventDefault();
      files.forEach((f) => void handleFile(f));
    },
    [handleFile],
  );

  const onDragOver = useCallback((e: React.DragEvent<HTMLTextAreaElement>) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      setDragging(true);
    }
  }, []);

  const onDragLeave = useCallback(() => setDragging(false), []);

  return { dragging, onPaste, onDrop, onDragOver, onDragLeave };
}
