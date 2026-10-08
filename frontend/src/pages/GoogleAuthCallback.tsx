// Landing page for the direct Google flow (see lib/googleAuth.ts). Google
// redirects here with an ID token in the URL fragment; we hand it to
// Supabase to sign in or to link Google to the current account.

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { consumeGoogleAuthResponse } from "@/lib/googleAuth";
import { supabase } from "@/lib/supabase";

export default function GoogleAuthCallback() {
  const navigate = useNavigate();
  // StrictMode runs effects twice in dev; the response is one-shot.
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    async function finish() {
      let result;
      try {
        result = consumeGoogleAuthResponse(window.location.hash);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Google sign-in failed.");
        navigate("/", { replace: true });
        return;
      }

      const credentials = {
        provider: "google",
        token: result.token,
        nonce: result.nonce,
      };

      if (result.mode === "link") {
        const { error } = await supabase.auth.linkIdentity(credentials);
        if (error) toast.error(error.message);
        else toast.success("Google account linked.");
        navigate(result.returnTo, { replace: true });
        return;
      }

      const { error } = await supabase.auth.signInWithIdToken(credentials);
      if (error) {
        toast.error(error.message);
        navigate("/", { replace: true });
        return;
      }
      // Session exists now; /auth/callback fills display_name from the
      // Google profile for brand-new accounts, then goes home.
      navigate("/auth/callback", { replace: true });
    }

    void finish();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p>Signing you in…</p>
    </div>
  );
}
