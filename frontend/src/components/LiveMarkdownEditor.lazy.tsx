// Lazy entry for LiveMarkdownEditor so CodeMirror stays out of the main
// bundle (landing page, board) and loads with the first editor on screen.
// The fallback reserves the editor's height to avoid a layout jump.

import { forwardRef, lazy, Suspense } from "react";

import type { LiveMarkdownEditorHandle, LiveMarkdownEditorProps } from "./LiveMarkdownEditor";

const Editor = lazy(() => import("./LiveMarkdownEditor"));

export const LazyLiveMarkdownEditor = forwardRef<LiveMarkdownEditorHandle, LiveMarkdownEditorProps>(
  function LazyLiveMarkdownEditor(props, ref) {
    return (
      <Suspense fallback={<div className="live-md" style={{ minHeight: props.minHeight ?? "1.5rem" }} />}>
        <Editor ref={ref} {...props} />
      </Suspense>
    );
  },
);
