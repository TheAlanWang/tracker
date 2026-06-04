// Media-query subscription — the runtime "is this query matching right now?"
// primitive used for layout decisions that CSS alone can't express (e.g.
// rendering a mobile bottom-sheet vs. a desktop side panel).
//
// Prefer Tailwind's responsive prefixes (`lg:` etc.) for anything that's
// purely a CSS swap — those have no hydration flash. Reach for this hook only
// when JS behavior actually branches on viewport (drawer open state, which
// container chrome to mount).
//
// Implemented with useSyncExternalStore so reads stay consistent with the
// matchMedia source (no useEffect flash, no tearing). The third argument is
// the server snapshot; we don't SSR today, but returning a stable `false`
// keeps it safe and mirrors the `typeof window === "undefined"` guards used
// elsewhere (see useTheme).

import { useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

// "Mobile" = below Tailwind's `lg` breakpoint (1024px). This is the single
// desktop<->mobile boundary for the app shell: the persistent left rail
// becomes an off-canvas drawer, and the AI panel becomes a full-screen sheet,
// below this width. Keep it in lockstep with the `lg:` CSS prefixes.
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 1023px)");
}
