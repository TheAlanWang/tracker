// Project color resolution.
//
// Data model: `projects.color` stores a SINGLE hex (always the light-mode
// variant). On render we map that to the appropriate variant for the
// active theme. This keeps the schema simple (1 column, not 2) while
// letting dark mode use desaturated, slightly-lighter swatches that
// don't look like they're glowing against a dark background.

export type ProjectColor = {
  // Identity hex — what gets saved into `projects.color` when picked.
  light: string;
  // Tailwind 400-ish equivalent: less saturated, slightly brighter.
  dark: string;
};

// Fixed palette used by the Project Settings color picker. Curated swatch
// set (like LabelsEditor) — broad enough for differentiation without
// exposing a full color wheel. Light = Tailwind 500-ish; dark = 400-ish.
export const PROJECT_COLOR_PALETTE: ProjectColor[] = [
  { light: "#3b82f6", dark: "#60a5fa" }, // blue
  { light: "#8b5cf6", dark: "#a78bfa" }, // violet
  { light: "#ec4899", dark: "#f472b6" }, // pink
  { light: "#ef4444", dark: "#f87171" }, // red
  { light: "#f59e0b", dark: "#fbbf24" }, // amber
  { light: "#10b981", dark: "#34d399" }, // emerald
  { light: "#14b8a6", dark: "#2dd4bf" }, // teal
  { light: "#64748b", dark: "#94a3b8" }, // slate
];

// Resolve a project's display color. Prefers the user-set `color` (and
// maps it through the palette for the dark variant); falls back to a
// deterministic hue derived from the project key.
export function projectDotColor(args: {
  key: string;
  color: string | null;
  // Pass the current theme so dark variants only fire in dark mode.
  // Default false (light) keeps existing call-sites that haven't been
  // updated working — they just render the light variant always.
  dark?: boolean;
}): string {
  if (args.color) {
    if (args.dark) {
      // User-saved color is always the light hex; look up the matching
      // dark variant. Custom (off-palette) hexes pass through unchanged
      // — we can't infer a dark variant for an arbitrary hex.
      const match = PROJECT_COLOR_PALETTE.find(
        (p) => p.light.toLowerCase() === args.color!.toLowerCase(),
      );
      if (match) return match.dark;
    }
    return args.color;
  }
  // Hash-derived fallback. Light: hsl(h, 55%, 55%) — vivid mid-tone.
  // Dark: hsl(h, 40%, 62%) — desaturated, slightly brighter. The 15%
  // saturation drop + 7% lightness bump roughly mirrors Tailwind's
  // 500→400 shift for arbitrary hues.
  const hue =
    Array.from(args.key).reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return args.dark
    ? `hsl(${hue} 40% 62%)`
    : `hsl(${hue} 55% 55%)`;
}
