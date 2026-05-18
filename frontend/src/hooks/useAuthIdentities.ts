import { useCallback, useEffect, useState } from "react";
import type { UserIdentity } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

// Reads the current user's linked auth providers (email, google, ...) from
// the Supabase session. Subscribes to USER_UPDATED so the list refreshes
// automatically after linkIdentity / updateUser / unlinkIdentity calls
// complete — including the linkIdentity OAuth roundtrip that re-enters the
// app via the URL fragment.
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
