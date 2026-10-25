import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { trackPageView } from "@/lib/analytics";

// Sends a GA page_view on every route change. Keyed on pathname only, so
// query/hash changes (filters, ?login=open) don't count as new pages.
export function GaPageViews() {
  const { pathname } = useLocation();
  useEffect(() => {
    trackPageView(pathname);
  }, [pathname]);
  return null;
}
