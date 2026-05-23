// LoginDialog — modal-based sign-in / sign-up flow.
//
// Visibility is controlled by Landing via the `?login=open` / `?login=signup`
// URL param (single source of truth, no Provider needed). Sign-in mode shows
// "Forgot password?" link; Sign-up mode adds a Name field that goes into
// user_metadata.display_name (used app-wide for greetings + avatars) and a
// green primary button + sparkles icon to visually differentiate the two
// modes at a glance.
//
// Auth errors render inline as a red banner above the submit button (NOT
// as toasts) so the user sees feedback in the dialog they're focused on.
// Friendly copy via friendlyAuthError() maps raw Supabase messages to
// plain language.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

type Mode = "signin" | "signup";

// Map Supabase's raw error strings to copy that sits comfortably in the
// dialog. Falls back to whatever Supabase returned so we never swallow a
// real, unexpected error.
function friendlyAuthError(raw: string, mode: Mode): string {
  const m = raw.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return "Wrong email or password. Try again or use Forgot password.";
  }
  if (m.includes("email not confirmed")) {
    return "Confirm your email first — check your inbox for the link.";
  }
  if (m.includes("user already registered") || m.includes("already been registered")) {
    return "An account with this email already exists. Try signing in.";
  }
  if (m.includes("password should be at least")) {
    return "Password needs to be at least 6 characters.";
  }
  if (mode === "signup" && m.includes("rate")) {
    return "Too many signups from here — wait a minute and try again.";
  }
  return raw;
}

// Top-of-dialog icon — different shape per mode so the two states are
// distinguishable at a glance even before reading the copy.
function ModeIcon({ mode }: { mode: Mode }) {
  if (mode === "signin") {
    // Key icon — "let me in"
    return (
      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 flex items-center justify-center">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5"
        >
          <circle cx="8" cy="15" r="4" />
          <path d="M10.85 12.15 19 4M18 5l3 3M15 8l3 3" />
        </svg>
      </div>
    );
  }
  // Sparkles icon — "new account"
  return (
    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
      </svg>
    </div>
  );
}

export function LoginDialog({
  initialMode = "signin",
  onClose,
}: {
  initialMode?: Mode;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Inline auth error (wrong password, email taken, etc). Errors *about this
  // form* belong here, not in a corner toast that can be missed.
  const [authError, setAuthError] = useState<string | null>(null);
  // When sign-up succeeds with email confirmation ON, Supabase returns no
  // session — the user has to click a verification link first. Holding the
  // email here flips the dialog to a "check your inbox" state instead of
  // silently closing.
  const [signupEmailSent, setSignupEmailSent] = useState<string | null>(null);
  // Mode-switch clears the error so a "wrong password" from sign-in doesn't
  // linger when the user flips to sign-up. Also resets the post-signup
  // success state so the user can come back and sign in.
  function switchMode(next: Mode) {
    setMode(next);
    setAuthError(null);
    setSignupEmailSent(null);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setSubmitting(true);
    try {
      const op =
        mode === "signin"
          ? supabase.auth.signInWithPassword({ email, password })
          : supabase.auth.signUp({
              email,
              password,
              // user_metadata.display_name is what the rest of the app reads
              // for greetings, avatars, activity attribution, etc. — capturing
              // it at signup avoids a "who are you?" follow-up on first load.
              options: { data: { display_name: name.trim() || null } },
            });
      const { data, error } = await op;
      if (error) {
        setAuthError(friendlyAuthError(error.message, mode));
        return;
      }
      if (mode === "signup") {
        // Supabase anti-enumeration: signUp with an email that already
        // has an account returns success with NO error, NO confirmation
        // email sent, and an empty `identities` array on the user. Detect
        // that signal and point the user at the right path instead of
        // showing a misleading "check your inbox" card that never lands.
        if (data.user && (data.user.identities?.length ?? 0) === 0) {
          setAuthError(
            "This email already has an account. If you signed up with Google, use the Google button below — then you can add a password from Profile Settings.",
          );
          return;
        }
        // Fresh signup + "Confirm email" ON → user created but no session
        // yet. Stay in the dialog and tell them to check email instead of
        // silently closing and bouncing them back to Landing.
        if (!data.session) {
          setSignupEmailSent(email);
          return;
        }
      }
      onClose();
      navigate("/");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setAuthError(error.message);
  }

  async function handleForgotPassword() {
    setAuthError(null);
    if (!email) {
      setAuthError("Enter your email above first.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    if (error) {
      setAuthError(error.message);
      return;
    }
    // Success messaging is positive feedback, not an error — toast is fine.
    toast.success(`Password reset link sent to ${email}.`);
  }

  const isSignin = mode === "signin";
  const title = isSignin ? "Welcome back" : "Create your account";
  const sub = isSignin
    ? "Sign in to continue."
    : "Free, no credit card required.";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white dark:bg-neutral-900 shadow-2xl p-6 relative"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 w-7 h-7 rounded-md text-slate-400 dark:text-neutral-500 hover:text-slate-700 dark:hover:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 flex items-center justify-center"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path
              fillRule="evenodd"
              d="M4.3 4.3a1 1 0 0 1 1.4 0L10 8.6l4.3-4.3a1 1 0 1 1 1.4 1.4L11.4 10l4.3 4.3a1 1 0 1 1-1.4 1.4L10 11.4l-4.3 4.3a1 1 0 1 1-1.4-1.4L8.6 10 4.3 5.7a1 1 0 0 1 0-1.4Z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {signupEmailSent ? (
          <div className="space-y-4 text-center pt-2 pb-1">
            <div className="mx-auto w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
              <MailCheck
                className="w-6 h-6 text-emerald-600 dark:text-emerald-400"
                strokeWidth={1.8}
              />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-neutral-200">
                Check your inbox
              </h2>
              <p className="text-sm text-slate-500 dark:text-neutral-400 leading-relaxed">
                We sent a verification link to{" "}
                <span className="font-medium text-slate-700 dark:text-neutral-300">
                  {signupEmailSent}
                </span>
                . Click it to finish signing up.
              </p>
            </div>
            <p className="text-xs text-slate-400 dark:text-neutral-500">
              Didn't get it? Check spam, or wait a minute and try again.
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-md"
              onClick={onClose}
            >
              Close
            </Button>
          </div>
        ) : (
        <>
        <div className="mb-5 flex items-start gap-3">
          <ModeIcon mode={mode} />
          <div className="flex-1 min-w-0">
            <p
              className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${isSignin ? "text-slate-500 dark:text-neutral-400" : "text-emerald-600"}`}
            >
              {isSignin ? "Sign in" : "Sign up"}
            </p>
            <h2 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900 dark:text-neutral-200">
              {title}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-neutral-400">{sub}</p>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full justify-center gap-2 rounded-md"
          onClick={handleGoogle}
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.25 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.11A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.45.34-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.95l3.66-2.84Z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.07.56 4.21 1.65l3.15-3.15C17.46 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
            />
          </svg>
          {isSignin ? "Continue with Google" : "Sign up with Google"}
        </Button>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-slate-200 dark:border-neutral-800" />
          </div>
          <div className="relative flex justify-center text-[11px] uppercase tracking-wide">
            <span className="bg-white dark:bg-neutral-900 px-2 text-slate-400 dark:text-neutral-500">Or</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {!isSignin && (
            <div className="space-y-1">
              <Label htmlFor="login-dlg-name">Your name</Label>
              <Input
                id="login-dlg-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={80}
                autoComplete="name"
                placeholder="Jane Doe"
                autoFocus
              />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="login-dlg-email">Email</Label>
            <Input
              id="login-dlg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@company.com"
              autoFocus={isSignin}
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="login-dlg-password">Password</Label>
              {isSignin && (
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-xs text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-100"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <Input
              id="login-dlg-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={isSignin ? "current-password" : "new-password"}
              minLength={6}
              placeholder={isSignin ? "••••••••" : "At least 6 characters"}
            />
          </div>

          {authError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4 mt-0.5 shrink-0"
                aria-hidden
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-11.25v4.5a.75.75 0 0 1-1.5 0v-4.5a.75.75 0 0 1 1.5 0ZM10 14a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="leading-snug">{authError}</span>
            </div>
          )}

          <Button
            type="submit"
            className={`w-full rounded-md ${!isSignin ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
            disabled={submitting}
          >
            {submitting
              ? "…"
              : isSignin
                ? "Sign in"
                : "Create account"}
          </Button>

          {!isSignin && (
            <p className="text-[11px] text-slate-400 dark:text-neutral-500 leading-relaxed">
              By creating an account, you agree to our terms and acknowledge
              the privacy policy.
            </p>
          )}
        </form>

        <p className="mt-5 text-center text-sm text-slate-500 dark:text-neutral-400">
          {isSignin ? (
            <>
              Don't have an account?{" "}
              <button
                type="button"
                className="font-medium text-slate-900 dark:text-neutral-200 hover:underline"
                onClick={() => switchMode("signup")}
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                className="font-medium text-slate-900 dark:text-neutral-200 hover:underline"
                onClick={() => switchMode("signin")}
              >
                Sign in
              </button>
            </>
          )}
        </p>
        </>
        )}
      </div>
    </div>
  );
}
