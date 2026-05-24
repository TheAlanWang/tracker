// SettingsLayout — content-only wrapper for settings pages. The left
// rail (Account / Workspaces / Projects) lives one level up in
// WorkspaceLayout via SettingsSidebar, so it gets the same flush-edge
// frame as the global SidebarNav. This component just centers and
// width-constrains the main content for readability.

type Props = {
  children: React.ReactNode;
};

export function SettingsLayout({ children }: Props) {
  // ~720px keeps form labels + inline help readable; matches Linear /
  // Supabase / Vercel settings widths.
  return <div className="mx-auto max-w-3xl min-w-0">{children}</div>;
}
