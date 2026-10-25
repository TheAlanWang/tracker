// Widgets that draw real content inside the live preview: images (the actual
// picture, resolved like everywhere else through <TaskImage>) and tables
// (rendered by the same ReactMarkdown + GFM as the read-only views). Each
// widget mounts a small React root into the DOM node CodeMirror gives it and
// unmounts it in destroy().

import { Facet } from "@codemirror/state";
import { type EditorView, WidgetType } from "@codemirror/view";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { TaskImage } from "@/components/TaskImage";
import { markdownUrlTransform } from "@/lib/resolveTaskImageUrl";

/** Called with the resolved URL when an image in the editor is clicked (the page's lightbox). */
export const imageClickFacet = Facet.define<(url: string) => void, ((url: string) => void) | null>({
  combine: (fns) => fns[0] ?? null,
});

const roots = new WeakMap<HTMLElement, Root>();

function mount(dom: HTMLElement, node: ReactNode) {
  const root = createRoot(dom);
  roots.set(dom, root);
  root.render(node);
}

function unmount(dom: HTMLElement) {
  const root = roots.get(dom);
  roots.delete(dom);
  // Deferred: CodeMirror may destroy a widget while React is rendering.
  if (root) queueMicrotask(() => root.unmount());
}

export class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
  ) {
    super();
  }
  eq(o: ImageWidget) {
    return o.src === this.src && o.alt === this.alt;
  }
  toDOM(view: EditorView) {
    const dom = document.createElement("span");
    dom.className = "cm-lp-image";
    // The picture's height is unknown until it loads; tell CodeMirror to
    // re-measure so clicks and the cursor stay aligned. (load doesn't
    // bubble, hence capture.)
    dom.addEventListener("load", () => view.requestMeasure(), true);
    const onClick = view.state.facet(imageClickFacet);
    mount(
      dom,
      <TaskImage
        src={this.src}
        alt={this.alt}
        onClick={onClick ?? undefined}
        className={`rounded max-h-96 w-auto${onClick ? " cursor-zoom-in" : ""}`}
      />,
    );
    return dom;
  }
  destroy(dom: HTMLElement) {
    unmount(dom);
  }
  // Clicks belong to the image (lightbox); the cursor reaches the source
  // with the arrow keys or a click elsewhere on the line.
  ignoreEvent() {
    return true;
  }
}

export class TableWidget extends WidgetType {
  constructor(readonly source: string) {
    super();
  }
  eq(o: TableWidget) {
    return o.source === this.source;
  }
  toDOM(view: EditorView) {
    const dom = document.createElement("div");
    dom.className = "cm-lp-table";
    // A click puts the cursor at the table's start, which turns it raw.
    dom.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const pos = view.posAtDOM(dom);
      view.dispatch({ selection: { anchor: pos } });
      view.focus();
    });
    mount(
      dom,
      // Same wrapper as the read-only renderer (TaskDetail markdownComponents.table):
      // scroll wide tables, 7rem cell floor so CJK columns aren't crushed.
      <div className="prose prose-sm max-w-none overflow-x-auto [&_th]:min-w-[7rem] [&_td]:min-w-[7rem] dark:prose-invert prose-code:bg-slate-100 dark:prose-code:bg-neutral-800/60 prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-normal prose-code:before:hidden prose-code:after:hidden">
        <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={markdownUrlTransform}>
          {this.source}
        </ReactMarkdown>
      </div>,
    );
    return dom;
  }
  destroy(dom: HTMLElement) {
    unmount(dom);
  }
  ignoreEvent() {
    return true;
  }
}
