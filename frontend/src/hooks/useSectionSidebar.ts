// Hooks for the tier-2 in-page section sub-nav. See SectionSidebarContext
// for the Provider/component side. Split out so the Provider's file
// stays component-only (Vite Fast Refresh requirement).

import { useContext, useEffect } from "react";

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
}

// Layout reads the registered config to decide whether to render the
// tier-2 sidebar.
export function useSectionSidebarValue(): SectionSidebarConfig | null {
  const ctx = useContext(SectionSidebarCtx);
  return ctx?.config ?? null;
}
