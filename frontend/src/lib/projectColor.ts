// Resolve a project's display color: prefer the user-set hex value
// stored on `projects.color`; fall back to a deterministic hue derived
// from the project key so existing projects (and ones whose owner hasn't
// chosen a color yet) keep a stable visual identity.

export function projectDotColor(args: {
  key: string;
  color: string | null;
}): string {
  if (args.color) return args.color;
  const hue =
    Array.from(args.key).reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return `hsl(${hue} 55% 55%)`;
}

// Fixed palette used by the Project Settings color picker. Same kind of
// curated swatch set as LabelsEditor — broad enough for differentiation
// without exposing a full color wheel.
export const PROJECT_COLOR_PALETTE = [
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#ef4444", // red
  "#f59e0b", // amber
  "#10b981", // emerald
  "#14b8a6", // teal
  "#64748b", // slate
];
