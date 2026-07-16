// SettingsLayout — content-only wrapper for settings pages. The left
// rail (Account / Workspaces / Projects) lives one level up in
// WorkspaceLayout via SettingsSidebar, so it gets the same flush-edge
// frame as the global SidebarNav. This component just centers and
// width-constrains the main content for readability.

import { useSectionSidebarValue } from "@/hooks/useSectionSidebar";

type Props = {
  children: React.ReactNode;
};

export function SettingsLayout({ children }: Props) {
  // The tier-2 SectionSidebar is an absolute overlay spanning the first
  // 10rem of <main> (see SectionSidebar.tsx) — it deliberately doesn't
  // shift content. On narrow desktop widths plain `mx-auto` centering
  // can put the content's left edge underneath it. When this page has
  // registered sections (rail visible at lg+), pin the left margin to
  // max(rail width, centered offset): identical to centered on wide
  // screens, flush against the rail instead of under it on narrow ones.
  const sections = useSectionSidebarValue();
  const railVisible = !!sections && sections.sections.length > 0;

  // ~720px keeps form labels + inline help readable; matches Linear /
  // Supabase / Vercel settings widths.
  return (
    <div
      className={`mx-auto max-w-3xl min-w-0 ${
        railVisible ? "lg:ml-[max(10rem,calc((100%-48rem)/2))]" : ""
      }`}
    >
      {children}
    </div>
  );
}
