// SettingsLayout — content-only wrapper for settings pages. The left
// rail (Account / Workspaces / Projects) lives one level up in
// WorkspaceLayout via SettingsSidebar, so it gets the same flush-edge
// frame as the global SidebarNav. This component just centers and
// width-constrains the main content for readability.
//
// The left margin is max(10rem, centered-offset), not plain mx-auto:
// the tier-2 SectionSidebar is an absolute overlay spanning the first
// 10rem of <main> (see SectionSidebar.tsx), and centering alone slid
// the content's left edge underneath it on narrow desktops. Applied
// unconditionally — rail or no rail (Billing) — so every settings page
// shares the same geometry and content never jumps horizontally when
// navigating between them. On wide screens this is exactly centered.

type Props = {
  children: React.ReactNode;
};

export function SettingsLayout({ children }: Props) {
  // ~720px keeps form labels + inline help readable; matches Linear /
  // Supabase / Vercel settings widths.
  return (
    <div className="mx-auto max-w-3xl min-w-0 lg:ml-[max(10rem,calc((100%-48rem)/2))]">
      {children}
    </div>
  );
}
