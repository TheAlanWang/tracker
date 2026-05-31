// Landing page for the password-recovery email link. Supabase establishes a
// short-lived recovery session from the link, which is enough for
// updateUser({ password }). AuthCallback routes here on PASSWORD_RECOVERY.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password needs to be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password });
      if (updErr) {
        setError(
          updErr.message.toLowerCase().includes("session")
            ? "This reset link has expired. Request a new one from the login screen."
            : updErr.message,
        );
        return;
      }
      toast.success("Password updated — you're signed in.");
      navigate("/", { replace: true });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-neutral-950 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-neutral-100">
          Set a new password
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-neutral-400">
          Choose a new password for your Trackly account.
        </p>
        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="rp-pw">New password</Label>
            <Input
              id="rp-pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="At least 6 characters"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rp-confirm">Confirm password</Label>
            <Input
              id="rp-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Saving…" : "Update password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
