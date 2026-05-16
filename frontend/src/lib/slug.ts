// Workspace name → URL slug.
// "Acme Inc." → "acme-inc"
// "  Hello, World!  " → "hello-world"
// Used by every "Create workspace" entry point so they all generate
// identical slugs.
export function slugifyWorkspace(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}
