// Curated palette for the avatar background-color picker in ProfileSettings.
// Values are Tailwind-500 hex codes so they look correct against white text
// and read as members of the same color family as the rest of the app.
//
// To add a new color: append here. The picker UI iterates this list; no
// other change needed. To remove a color: just delete the entry — existing
// users who picked it will still have that hex stored on their profile
// (Avatar.tsx will render it the same), just won't be able to pick it again
// from the swatch row.
export const AVATAR_COLORS: ReadonlyArray<{ name: string; value: string }> = [
  { name: "Slate", value: "#64748b" },
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Emerald", value: "#10b981" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Sky", value: "#0ea5e9" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Pink", value: "#ec4899" },
];
