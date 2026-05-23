import { useCallback, useEffect, useState } from "react";
import type { UserIdentity } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

// Reads the current user's linked auth providers (email, google, ...) from
// the Supabase session. Subscribes to USER_UPDATED + SIGNED_IN so the
// list refreshes automatically after updateUser / the linkIdentity OAuth
// roundtrip that re-enters the app via the URL fragment.
//
// IMPORTANT: supabase.auth.unlinkIdentity() mutates the server-side row
// but does NOT emit USER_UPDATED to the current tab — callers must invoke
// `refresh()` explicitly after a successful unlink, otherwise the
// returned `identities` array stays stale.
export function useAuthIdentities() {
  const [identities, setIdentities] = useState<UserIdentity[] | null>(null);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    setIdentities(data.user?.identities ?? []);
  }, []);

  useEffect(() => {
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "USER_UPDATED" || event === "SIGNED_IN") {
        refresh();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  return { identities, refresh };
}
