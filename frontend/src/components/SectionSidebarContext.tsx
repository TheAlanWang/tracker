// SectionSidebarContext — Provider + context object for the tier-2
// in-page section sub-nav. Hooks (useSectionSidebar /
// useSectionSidebarValue) live in @/hooks/useSectionSidebar so this
// file stays component-only (Vite Fast Refresh requirement).
//
// Design notes (apply across both files):
//   - Pages call useSectionSidebar({ title, sections }) on mount;
//     unmounting clears the config so the sidebar auto-hides when you
//     leave the page.
//   - JSON.stringify-based effect key in the hook lets callers pass
//     inline-built objects without churning the effect every render.

import { createContext, useMemo, useState } from "react";

export type SectionLink = {
  id: string;
  label: string;
};

export type SectionSidebarConfig = {
  // Title shown at the top of the tier-2 rail (e.g. "Profile").
  title?: string;
  sections: SectionLink[];
};

export type SectionSidebarCtxValue = {
  config: SectionSidebarConfig | null;
  setConfig: (c: SectionSidebarConfig | null) => void;
};

// Exported so the hooks file can subscribe to the same context.
// eslint-disable-next-line react-refresh/only-export-components
export const SectionSidebarCtx = createContext<SectionSidebarCtxValue | null>(
  null,
);

export function SectionSidebarProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [config, setConfig] = useState<SectionSidebarConfig | null>(null);
  const value = useMemo(() => ({ config, setConfig }), [config]);
  return (
    <SectionSidebarCtx.Provider value={value}>
      {children}
    </SectionSidebarCtx.Provider>
  );
}
