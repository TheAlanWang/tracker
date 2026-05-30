// Navigation catalog for the command palette's "Go to" group.
//
// These targets are static app routes (known at build time), not workspace
// data — so the palette filters them client-side with no request. The settings
// section lists below are the single source of truth: the settings pages import
// them for their tier-2 sub-nav, and here we turn each into a deep-link.

import type { SectionLink } from "@/components/SectionSidebarContext";

// Stable in-page sections. Order matches the rendered <section id=...> anchors.
// (ProfileSettings inserts a transient "Invitations" section between Sign-In
// and Danger Zone when invitations exist; it's omitted here because there's
// nothing to scroll to when the list is empty.)
export const WORKSPACE_SETTINGS_SECTIONS: SectionLink[] = [
  { id: "ws-general", label: "General" },
  { id: "ws-members", label: "Members" },
  { id: "ws-features", label: "Features" },
  { id: "ws-danger", label: "Danger Zone" },
];

export const PROFILE_SETTINGS_SECTIONS: SectionLink[] = [
  { id: "profile-general", label: "General" },
  { id: "profile-signin", label: "Sign-In Methods" },
  { id: "profile-danger", label: "Danger Zone" },
];

// Extra search terms so a target surfaces under words that aren't in its label
// (e.g. typing "labels" finds the Features section that hosts the toggle).
const SECTION_KEYWORDS: Record<string, string> = {
  "ws-general": "name slug rename workspace",
  "ws-members": "invite people team roles permissions",
  "ws-features": "labels dependencies block sprints goals toggles modules",
  "ws-danger": "delete leave transfer ownership",
  "profile-general": "name avatar display",
  "profile-signin": "password oauth email login authentication",
  "profile-danger": "delete account",
};

export type NavTarget = {
  // Unique key (also used as the cmdk item value for keyboard selection).
  id: string;
  label: string;
  // Shown as the right-hand sublabel to disambiguate (e.g. "Workspace Settings").
  context: string;
  href: string;
  keywords?: string;
};

// Build the full list of navigation targets for one workspace.
export function buildNavTargets(wsSlug: string): NavTarget[] {
  if (!wsSlug) return [];
  const base = `/w/${wsSlug}`;

  const targets: NavTarget[] = [
    { id: "page-dashboard", label: "Dashboard", context: "Page", href: `${base}/dashboard` },
    { id: "page-goals", label: "Goals", context: "Page", href: `${base}/goals`, keywords: "objectives okrs" },
    { id: "page-billing", label: "Billing", context: "Page", href: `${base}/billing`, keywords: "plan subscription upgrade pricing tier seats pro payment" },
    { id: "page-my-issues", label: "My Issues", context: "Page", href: `${base}/my-issues`, keywords: "assigned tasks mine" },
    { id: "page-ws-settings", label: "Workspace Settings", context: "Page", href: `${base}/settings`, keywords: "preferences configuration" },
    { id: "page-profile", label: "Profile", context: "Page", href: `${base}/profile`, keywords: "account me" },
  ];

  for (const s of WORKSPACE_SETTINGS_SECTIONS) {
    targets.push({
      id: `wss-${s.id}`,
      label: s.label,
      context: "Workspace Settings",
      href: `${base}/settings#${s.id}`,
      keywords: SECTION_KEYWORDS[s.id],
    });
  }
  for (const s of PROFILE_SETTINGS_SECTIONS) {
    targets.push({
      id: `pss-${s.id}`,
      label: s.label,
      context: "Profile",
      href: `${base}/profile#${s.id}`,
      keywords: SECTION_KEYWORDS[s.id],
    });
  }
  return targets;
}

// Case-insensitive match across label, context, and keywords.
export function matchNavTarget(t: NavTarget, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  const hay = `${t.label} ${t.context} ${t.keywords ?? ""}`.toLowerCase();
  return hay.includes(q);
}
