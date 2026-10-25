// LiveMarkdownEditor — the Obsidian-style Markdown editor (CodeMirror 6)
// used for task / project descriptions and comments: Markdown renders in
// place, the line under the cursor shows its raw syntax (lib/livePreview).
// Ported from commonplace's handbook editor.
//
// The text is never rewritten: the "\n" line separator keeps "\r" as typed,
// and onChange hands back the document as is. Load it through
// LiveMarkdownEditor.lazy so CodeMirror only downloads when a page needs it.
//
// Keys: Enter continues a list or quote (lib/livePreview enterMarkup),
// Shift+Enter is a plain newline; Mod-Enter = onSubmit. Escape blurs the
// editor (so the description autosaves) and stops there; a second Escape
// reaches the modal. While an IME composes, Escape only cancels the
// composition. Cmd/Ctrl+click on a link opens it in a new tab (a plain
// click when readOnly).
//
// Styles: the cm-lp-* classes live in index.css (Tailwind, light + dark).

import { autocompletion } from "@codemirror/autocomplete";
import { defaultKeymap, deleteCharBackwardStrict, history, historyKeymap, insertNewline } from "@codemirror/commands";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap, placeholder as placeholderExt } from "@codemirror/view";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import type { Member } from "@/features/members/api";
import { mentionCompletion } from "@/lib/mentions";
import { enterMarkup, linkAt, livePreview, openableUrl } from "@/lib/livePreview";

export type LiveMarkdownEditorHandle = {
  focus(): void;
  insertAtCursor(text: string): void;
  /** Replaces the first occurrence of `find` (no-op when absent). */
  replaceText(find: string, replace: string): void;
  getText(): string;
};

export type LiveMarkdownEditorProps = {
  /** Initial text; later values are applied only while the editor isn't focused. */
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  /** Mod-Enter. */
  onSubmit?: () => void;
  placeholder?: string;
  /** Accessible name of the text box. */
  label: string;
  maxLength?: number;
  /** Enables @-mention completion. */
  members?: Member[];
  onImageClick?: (url: string) => void;
  /** Image files pasted or dropped into the editor. */
  onImageFiles?: (files: File[]) => void;
  minHeight?: string;
  className?: string;
  /** Rendered but not editable (no cursor); a plain click on a link opens it. */
  readOnly?: boolean;
};

function imageFiles(list: FileList | undefined | null) {
  return Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
}

/**
 * Escape while an IME composes (Safari sends it, isComposing set, to cancel
 * the pinyin; just after compositionend too) stays in the editor. Otherwise
 * Escape blurs. Either way the modal's own Escape doesn't fire this time.
 * Not preventDefault while composing, so the IME still cancels.
 */
function escapeHandling() {
  let endedAt = -Infinity;
  return EditorView.domEventHandlers({
    compositionend() {
      endedAt = Date.now();
      return false;
    },
    keydown(e, view) {
      if (e.key !== "Escape") return false;
      e.stopPropagation();
      if (e.isComposing || e.keyCode === 229 || view.composing || Date.now() - endedAt < 100) return false;
      view.contentDOM.blur();
      return true;
    },
  });
}

function editability(readOnly: boolean) {
  return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)];
}

const LiveMarkdownEditor = forwardRef<LiveMarkdownEditorHandle, LiveMarkdownEditorProps>(function LiveMarkdownEditor(
  { value, onChange, onBlur, onSubmit, placeholder, label, maxLength, members, onImageClick, onImageFiles, minHeight, className, readOnly = false },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  /** The text last handed to onChange (or loaded): a `value` equal to it is our own echo. */
  const known = useRef(value);
  const handlers = useRef({ onChange, onBlur, onSubmit, onImageFiles });
  useEffect(() => {
    handlers.current = { onChange, onBlur, onSubmit, onImageFiles };
  });
  const mentions = useRef(new Compartment());
  const editable = useRef(new Compartment());

  // The view lives as long as the component; later props are synced below.
  const initial = useRef({ value, label, placeholder, maxLength, members, onImageClick, minHeight, readOnly });
  useEffect(() => {
    const init = initial.current;
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: init.value,
        extensions: [
          EditorState.lineSeparator.of("\n"), // keep "\r" (and so "\r\n") as typed
          history(),
          Prec.high(
            keymap.of([
              { key: "Enter", run: enterMarkup, shift: insertNewline },
              { key: "Backspace", run: deleteCharBackwardStrict, shift: deleteCharBackwardStrict, preventDefault: true },
              {
                key: "Mod-Enter",
                run: () => {
                  if (!handlers.current.onSubmit) return false;
                  handlers.current.onSubmit();
                  return true;
                },
              },
            ]),
          ),
          keymap.of([...defaultKeymap.filter((b) => b.key !== "Escape" && b.key !== "Mod-Enter"), ...historyKeymap]),
          EditorView.lineWrapping,
          escapeHandling(),
          // Escape never leaves the editor, even when a keymap (the @-mention
          // list closing) handles it first and stops the handlers above.
          Prec.highest(
            EditorView.domEventHandlers({
              keydown(e) {
                if (e.key === "Escape") e.stopPropagation();
                return false;
              },
            }),
          ),
          EditorView.contentAttributes.of({ "aria-label": init.label, "aria-multiline": "true" }),
          init.placeholder ? placeholderExt(init.placeholder) : [],
          init.maxLength != null
            ? EditorState.changeFilter.of((tr) => !tr.docChanged || tr.newDoc.length <= init.maxLength! || tr.newDoc.length <= tr.startState.doc.length)
            : [],
          editable.current.of(editability(init.readOnly)),
          mentions.current.of(init.members ? autocompletion({ override: [mentionCompletion(init.members)], icons: false }) : []),
          livePreview({ onImageClick: init.onImageClick }),
          init.minHeight ? EditorView.theme({ ".cm-content": { minHeight: init.minHeight } }) : [],
          EditorView.domEventHandlers({
            mousedown(e, view) {
              if (!(e.metaKey || e.ctrlKey || view.state.readOnly) || e.button !== 0) return false;
              const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
              const link = pos == null ? null : linkAt(view.state, pos);
              const url = link && openableUrl(link);
              if (!url) return false;
              e.preventDefault();
              window.open(url, "_blank", "noopener,noreferrer");
              return true;
            },
            paste(e) {
              const files = imageFiles(e.clipboardData?.files);
              if (!files.length || !handlers.current.onImageFiles) return false;
              e.preventDefault();
              handlers.current.onImageFiles(files);
              return true;
            },
            drop(e, view) {
              const files = imageFiles(e.dataTransfer?.files);
              if (!files.length || !handlers.current.onImageFiles) return false;
              e.preventDefault();
              // Insert where it was dropped, and take focus: a drop doesn't
              // focus by itself, and leaving the editor is what autosaves.
              const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
              if (pos != null) view.dispatch({ selection: { anchor: pos } });
              view.focus();
              handlers.current.onImageFiles(files);
              return true;
            },
            blur() {
              handlers.current.onBlur?.();
              return false;
            },
          }),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return;
            const text = u.state.doc.toString();
            known.current = text;
            handlers.current.onChange(text);
          }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    view.current?.dispatch({ effects: editable.current.reconfigure(editability(readOnly)) });
  }, [readOnly]);

  // Member list arrives after the first render (React Query): swap the completion in.
  useEffect(() => {
    view.current?.dispatch({
      effects: mentions.current.reconfigure(members ? autocompletion({ override: [mentionCompletion(members)], icons: false }) : []),
    });
  }, [members]);

  // A new text from outside (a refetch, a cleared composer): replace the
  // document — but never under the user's hands.
  useEffect(() => {
    const v = view.current;
    if (!v || value === known.current || v.hasFocus) return;
    known.current = value;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => view.current?.focus(),
      insertAtCursor(text) {
        const v = view.current;
        if (!v) return;
        v.dispatch(v.state.replaceSelection(text), { scrollIntoView: true });
      },
      replaceText(find, replace) {
        const v = view.current;
        if (!v) return;
        const at = v.state.doc.toString().indexOf(find);
        if (at >= 0) v.dispatch({ changes: { from: at, to: at + find.length, insert: replace } });
      },
      getText: () => view.current?.state.doc.toString() ?? known.current,
    }),
    [],
  );

  return <div ref={host} className={`live-md ${className ?? ""}`} data-live-editor />;
});

export default LiveMarkdownEditor;
