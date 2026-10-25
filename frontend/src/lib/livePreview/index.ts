import type { Extension } from "@codemirror/state";

import { blockField, blockFocus } from "./blocks";
import { livePreviewPlugin, markdownLanguage } from "./core";
import { imageClickFacet } from "./widgets";

export { enterMarkup, linkAt, markdownLanguage, openableUrl } from "./core";

/** The live preview: Markdown language, inline decorations, rendered blocks. */
export function livePreview(opts: { onImageClick?: (url: string) => void } = {}): Extension {
  return [
    markdownLanguage,
    livePreviewPlugin,
    blockField,
    blockFocus,
    opts.onImageClick ? imageClickFacet.of(opts.onImageClick) : [],
  ];
}
