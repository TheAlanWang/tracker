// Set `document.title` to "<name> · Tracker" for the current page.
// Restoring on unmount isn't necessary in our SPA — the next route
// immediately sets its own title. We do reset to plain "Tracker" if a
// page mounts with an empty title.

import { useEffect } from "react";

const SUFFIX = "Tracker";

export function useDocumentTitle(title?: string | null) {
  useEffect(() => {
    const trimmed = (title ?? "").trim();
    document.title = trimmed ? `${trimmed} · ${SUFFIX}` : SUFFIX;
  }, [title]);
}
