// Google sign-in without the Supabase-hosted redirect.
//
// signInWithOAuth bounces through https://<ref>.supabase.co/auth/v1/callback,
// so Google's consent screen shows "continue to <ref>.supabase.co" and the
// supabase.co domain blocks OAuth brand verification (we can't prove we own
// it). Instead we run the OIDC implicit flow ourselves: redirect to Google
// with response_type=id_token, land back on our own /auth/google, and hand
// the ID token to Supabase (signInWithIdToken / linkIdentity) to verify.
//
// Nonce: Google embeds whatever nonce we send into the ID token; Supabase
// hashes the raw nonce we pass it and compares. So Google gets SHA-256(raw),
// Supabase gets raw. `state` guards the callback against forged responses.

// Public identifier (it appears in every Google auth URL) — not a secret.
// Must also be listed under Client IDs in Supabase → Auth → Providers → Google.
const GOOGLE_CLIENT_ID =
  "429944523334-7gomvn19mnjc5fdl1an7ri4lmlb41i03.apps.googleusercontent.com";

const STORAGE_KEY = "trackly.googleAuth";

export type GoogleAuthMode = "signin" | "link";

interface PendingGoogleAuth {
  state: string;
  nonce: string;
  mode: GoogleAuthMode;
  returnTo: string;
}

export interface GoogleAuthResult {
  token: string;
  nonce: string;
  mode: GoogleAuthMode;
  returnTo: string;
}

function randomString(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

// Navigates the whole page to Google. `returnTo` is where a "link" flow
// lands afterwards; sign-in always goes home.
export async function startGoogleAuth(
  mode: GoogleAuthMode,
  returnTo = "/",
): Promise<void> {
  const pending: PendingGoogleAuth = {
    state: randomString(),
    nonce: randomString(),
    mode,
    returnTo,
  };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: `${window.location.origin}/auth/google`,
    response_type: "id_token",
    scope: "openid email profile",
    nonce: await sha256Hex(pending.nonce),
    state: pending.state,
    prompt: "select_account",
  });
  window.location.assign(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
  );
}

// Reads Google's response from the URL fragment on /auth/google. Throws a
// user-facing message on cancel / mismatch. One-shot: clears the pending
// state so a reload can't replay it.
export function consumeGoogleAuthResponse(hash: string): GoogleAuthResult {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
  const params = new URLSearchParams(hash.replace(/^#/, ""));

  const error = params.get("error");
  if (error) {
    throw new Error(
      error === "access_denied"
        ? "Google sign-in was cancelled."
        : `Google sign-in failed (${error}).`,
    );
  }

  const pending = raw ? (JSON.parse(raw) as PendingGoogleAuth) : null;
  const token = params.get("id_token");
  if (!pending || !token || params.get("state") !== pending.state) {
    throw new Error("Google sign-in expired. Please try again.");
  }
  return {
    token,
    nonce: pending.nonce,
    mode: pending.mode,
    returnTo: pending.returnTo,
  };
}
