// AutosaveMarkdown — a click-to-edit Markdown field (task / project
// description), Notion / Linear style: no edit mode, no Save button. The
// text is saved when the editor loses focus, when the component unmounts
// (modal closed, another task opened) and on pagehide — only when it changed,
// and only after image uploads in flight have landed, so an
// `![uploading…]()` placeholder is never stored.
//
// `base` is the text known to be on the server. Local edits that differ from
// it are never replaced by an incoming `value` (a refetch while typing, or
// after a failed save); a newer server value is adopted only while the field
// is clean and not focused.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { LiveMarkdownEditorHandle } from "@/components/LiveMarkdownEditor";
import { LazyLiveMarkdownEditor } from "@/components/LiveMarkdownEditor.lazy";
import { useImagePasteUpload } from "@/lib/useImagePasteUpload";

export type AutosaveMarkdownProps = {
  /** The server value. */
  value: string;
  onSave: (text: string) => Promise<void>;
  // Image upload; uploads no-op until both are known.
  workspaceId?: string;
  userId?: string;
  placeholder: string;
  label: string;
  onImageClick?: (url: string) => void;
  minHeight?: string;
};

export function AutosaveMarkdown({ value, onSave, workspaceId, userId, placeholder, label, onImageClick, minHeight }: AutosaveMarkdownProps) {
  const [text, setText] = useState(value);
  const textRef = useRef(value);
  const baseRef = useRef(value);
  const valueRef = useRef(value);
  /** The text whose save is in flight. */
  const savingRef = useRef<string | null>(null);
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
    valueRef.current = value;
  });
  const host = useRef<HTMLDivElement>(null);
  const editorRef = useRef<LiveMarkdownEditorHandle>(null);

  // The upload hook edits through this handle. If the editor is gone (modal
  // closed mid-upload) it edits the text directly, so the pending save still
  // gets the final image link.
  const handle = useRef<LiveMarkdownEditorHandle>({
    focus: () => editorRef.current?.focus(),
    insertAtCursor: (t) => (editorRef.current ? editorRef.current.insertAtCursor(t) : void (textRef.current += t)),
    replaceText: (find, rep) =>
      editorRef.current ? editorRef.current.replaceText(find, rep) : void (textRef.current = textRef.current.replace(find, rep)),
    getText: () => editorRef.current?.getText() ?? textRef.current,
  });
  const upload = useImagePasteUpload({ workspaceId, userId, editor: handle });
  const settled = upload.settled;

  const onChange = useCallback((t: string) => {
    textRef.current = t;
    setText(t);
  }, []);

  const save = useCallback(async () => {
    await settled();
    const t = textRef.current;
    if (t === baseRef.current) {
      // Clean: catch up with a server value that arrived while focused.
      if (valueRef.current !== t && !host.current?.contains(document.activeElement)) {
        baseRef.current = textRef.current = valueRef.current;
        setText(valueRef.current);
      }
      return;
    }
    // Blur and unmount often come back to back (click outside → modal
    // closes): one save per text.
    if (t === savingRef.current) return;
    savingRef.current = t;
    try {
      await onSaveRef.current(t);
      baseRef.current = t;
    } catch (err) {
      toast.error(err instanceof Error ? `Couldn't save: ${err.message}` : "Couldn't save");
    } finally {
      if (savingRef.current === t) savingRef.current = null;
    }
  }, [settled]);

  // A new server value: adopt it only when there's nothing unsaved and the
  // user isn't in the field.
  useEffect(() => {
    if (textRef.current !== baseRef.current || host.current?.contains(document.activeElement)) return;
    baseRef.current = textRef.current = value;
    setText(value);
  }, [value]);

  // Unmount (modal closed, another task) and pagehide: save what's pending.
  useEffect(() => {
    const onHide = () => void save();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      void save();
    };
  }, [save]);

  return (
    <div ref={host} className="relative" {...upload.dropHandlers}>
      <LazyLiveMarkdownEditor
        ref={editorRef}
        value={text}
        onChange={onChange}
        onBlur={() => void save()}
        label={label}
        placeholder={placeholder}
        onImageClick={onImageClick}
        onImageFiles={upload.onImageFiles}
        minHeight={minHeight}
      />
      {upload.dragging && (
        <div className="pointer-events-none absolute inset-0 rounded border-2 border-dashed border-blue-400 bg-blue-50/80 dark:bg-blue-950/40 flex items-center justify-center text-sm font-medium text-blue-700 dark:text-blue-300">
          Drop image to upload
        </div>
      )}
    </div>
  );
}
