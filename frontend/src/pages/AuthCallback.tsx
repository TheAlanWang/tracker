import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { supabase } from "@/lib/supabase";

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    async function autofillDisplayName() {
      // Fill display_name from the OAuth provider's `name` field — but only
      // when the user has never set one (i.e. brand-new account via Google
      // or GitHub). Existing users who go through OAuth again to link a new
      // provider already have their preferred name and shouldn't be
      // overwritten.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const meta = user.user_metadata ?? {};
      if (meta.display_name) return;
      const oauthName = user.identities
        ?.map(
          (i) => (i.identity_data?.name as string | undefined) ?? undefined,
        )
        .find((n): n is string => typeof n === "string" && n.trim().length > 0);
      if (!oauthName) return;
      await supabase.auth.updateUser({ data: { display_name: oauthName } });
    }

    // A password-recovery link carries `type=recovery` and fires a
    // PASSWORD_RECOVERY event. Those users must land on the set-new-password
    // page, NOT home (which would sign them in without ever letting them
    // choose a new password).
    const isRecovery =
      window.location.hash.includes("type=recovery") ||
      new URLSearchParams(window.location.search).get("type") === "recovery";

    const sub = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        navigate("/reset-password", { replace: true });
        return;
      }
      if (event === "SIGNED_IN" && !isRecovery) {
        // Fire autofill in the background — if it succeeds the user lands
        // on the home page with their name pre-populated; if it fails
        // (network, race, anything), the home page still loads, the user
        // can set their name in Profile Settings later.
        autofillDisplayName().finally(() => {
          navigate("/", { replace: true });
        });
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return;
      if (isRecovery) {
        // getSession can resolve before PASSWORD_RECOVERY fires — guard the
        // recovery case here too so we don't bounce to home first.
        navigate("/reset-password", { replace: true });
        return;
      }
      autofillDisplayName().finally(() => {
        navigate("/", { replace: true });
      });
    });

    return () => sub.data.subscription.unsubscribe();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p>Signing you in…</p>
    </div>
  );
}
