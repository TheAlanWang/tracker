// AuthConfirm — landing page for email links that use the token_hash
// template form ({{ .SiteURL }}/auth/confirm?token_hash=...&type=...).
//
// Why this exists: the default Supabase templates link to the project's
// *.supabase.co /auth/v1/verify endpoint, so emails sent from
// noreply@gettrackly.dev pointed at a third-party domain — a
// phishing-shaped mismatch that spam filters punish. With this route the
// email links live on gettrackly.dev and WE exchange the token via
// supabase.auth.verifyOtp(), which sets the session directly.
//
// Post-verify behavior mirrors AuthCallback (the fragment-token flow):
// recovery → /reset-password (user must choose a new password before
// touching the app); everything else (invite / signup / magiclink /
// email_change) → home, where invited users see the in-app accept flow.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { EmailOtpType } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

const OTP_TYPES: EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

function parseLink(): { tokenHash: string; type: EmailOtpType } | null {
  const params = new URLSearchParams(window.location.search);
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  if (!tokenHash || !type || !OTP_TYPES.includes(type)) return null;
  return { tokenHash, type };
}

export default function AuthConfirm() {
  const navigate = useNavigate();
  // Parsed once on mount (lazy initializer) — the URL doesn't change while
  // this page is up, and deriving it here keeps the effect free of
  // synchronous setState (react-hooks/set-state-in-effect).
  const [link] = useState(parseLink);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  useEffect(() => {
    if (!link) return;
    let cancelled = false;
    supabase.auth
      .verifyOtp({ type: link.type, token_hash: link.tokenHash })
      .then(({ error }) => {
        if (cancelled) return;
        if (error) {
          // Most common real-world case: the link was already used or
          // expired (Supabase one-time tokens). Say so plainly instead of
          // surfacing a raw API error.
          setVerifyError(
            "This link has expired or was already used. Request a new one " +
              "and try again.",
          );
          return;
        }
        navigate(link.type === "recovery" ? "/reset-password" : "/", {
          replace: true,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [link, navigate]);

  const message = !link
    ? "This link is malformed. Please use the link from your email."
    : verifyError;

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      {message ? (
        <div className="max-w-sm text-center space-y-3">
          <p className="text-slate-700 dark:text-neutral-300">{message}</p>
          <Link
            to="/"
            className="inline-block text-sm text-blue-600 hover:underline"
          >
            Back to Trackly
          </Link>
        </div>
      ) : (
        <p>Confirming…</p>
      )}
    </div>
  );
}
