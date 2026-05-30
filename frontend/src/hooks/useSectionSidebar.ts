// Hooks for the tier-2 in-page section sub-nav. See SectionSidebarContext
// for the Provider/component side. Split out so the Provider's file
// stays component-only (Vite Fast Refresh requirement).

import { useContext, useEffect } from "react";
import { useLocation } from "react-router-dom";

import {
  SectionSidebarCtx,
  type SectionSidebarConfig,
} from "@/components/SectionSidebarContext";

// Pages call this to register their in-page sections. The hook clears
// the config on unmount so navigating away naturally hides the tier-2
// sidebar.
export function useSectionSidebar(config: SectionSidebarConfig | null) {
  const ctx = useContext(SectionSidebarCtx);
  if (!ctx) {
    throw new Error(
      "useSectionSidebar must be used within <SectionSidebarProvider>",
    );
  }
  const { setConfig } = ctx;

  // Serialise by content so inline-constructed objects don't re-fire
  // the effect on every render.
  const configKey = JSON.stringify(config);
  useEffect(() => {
    setConfig(config);
    return () => setConfig(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey, setConfig]);

  // Deep-link support: when the URL carries a #section hash (e.g. from the
  // command palette's "Go to" results), scroll that section into view. The
  // section sidebar's own clicks don't set the hash, so this only fires for
  // real navigations/refreshes. Retries across a few frames because the target
  // page may not have painted its sections yet when the hash first applies.
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));
    let tries = 0;
    let raf = 0;
    const tryScroll = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (tries++ < 10) {
        raf = requestAnimationFrame(tryScroll);
      }
    };
    raf = requestAnimationFrame(tryScroll);
    return () => cancelAnimationFrame(raf);
    // configKey: re-run once this page's sections register, so the anchor exists.
  }, [hash, configKey]);
}

// Layout reads the registered config to decide whether to render the
// tier-2 sidebar.
export function useSectionSidebarValue(): SectionSidebarConfig | null {
  const ctx = useContext(SectionSidebarCtx);
  return ctx?.config ?? null;
}
