// Profile Settings page.
//
// Two sections:
//   1. General settings — edit display name, view (read-only) sign-in email.
//      Display name is what the rest of the app uses for greetings, avatars,
//      and activity attribution; missing display name silently falls back to
//      email in those surfaces.
//   2. Workspace invitations — pending invites for the current user, with
//      accept/decline. Renders only when there are pending invitations.
//
// Routed under SettingsLayout (/w/:wsSlug/profile), so the workspaces + project
// sidebar lives one level up.

import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Camera } from "lucide-react";

import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type Invitation,
  useAcceptInvitation,
  useDeclineInvitation,
  useMyInvitations,
} from "@/features/invitations/api";
import {
  type Me,
  useCurrentUser,
  useDeleteAccount,
  useUpdateProfile,
} from "@/hooks/useCurrentUser";
import { supabase } from "@/lib/supabase";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const AVATAR_BUCKET = "avatars";
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export default function ProfileSettings() {
  useDocumentTitle("Profile Settings");
  const { data: me } = useCurrentUser();
  const { data: invitations = [] } = useMyInvitations();

  if (!me) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  // Keyed remount when the signed-in user changes (rare in practice — only on
  // sign-out / sign-in). Lets the inner component initialise its draft state
  // synchronously from `me`, avoiding a setState-in-effect hydration step.
  return (
    <ProfileSettingsContent key={me.id} me={me} invitations={invitations} />
  );
}

function ProfileSettingsContent({
  me,
  invitations,
}: {
  me: Me;
  invitations: Invitation[];
}) {
  const updateMutation = useUpdateProfile();
  const [displayName, setDisplayName] = useState(me.display_name ?? "");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dirty = (me.display_name ?? "") !== displayName;

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    try {
      await updateMutation.mutateAsync({
        display_name: displayName || undefined,
      });
      toast.success("Profile updated");
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to update profile";
      toast.error(detail);
    }
  }

  async function onAvatarChosen(file: File) {
    // Validate locally so the user gets immediate feedback rather than a
    // Supabase Storage 4xx three seconds later.
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Avatar must be PNG / JPEG / WebP / GIF.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("Avatar must be under 2 MB.");
      return;
    }

    setUploading(true);
    try {
      // Path: <user_id>/<timestamp>.<ext> so the Storage RLS policy that
      // requires `folder == auth.uid()` is satisfied, and so each upload
      // gets a unique URL (no <img> browser caching issues across changes).
      const ext = file.name.split(".").pop() || "png";
      const path = `${me.id}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type });
      if (uploadErr) throw uploadErr;

      const { data: pub } = supabase.storage
        .from(AVATAR_BUCKET)
        .getPublicUrl(path);

      await updateMutation.mutateAsync({ avatar_url: pub.publicUrl });
      toast.success("Avatar updated");
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Failed to upload";
      toast.error(detail);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onAvatarRemoved() {
    if (!me.avatar_url) return;
    if (!confirm("Remove your avatar? Your initial will show instead.")) return;
    try {
      await updateMutation.mutateAsync({ avatar_url: "" });
      toast.success("Avatar removed");
    } catch {
      toast.error("Failed to remove avatar");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <header>
        <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-100">Profile Settings</h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400">
          Your personal account info — display name and email.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-medium text-slate-900 dark:text-slate-100 dark:text-slate-100">General settings</h2>
        <form onSubmit={onSave}>
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
            <SettingRow
              label="Avatar"
              description="PNG / JPEG / WebP / GIF, up to 2 MB."
            >
              <div className="flex items-center gap-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ALLOWED_TYPES.join(",")}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onAvatarChosen(f);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || updateMutation.isPending}
                  aria-label={me.avatar_url ? "Change avatar" : "Upload avatar"}
                  className="group relative h-14 w-14 rounded-full overflow-hidden ring-1 ring-slate-200 dark:ring-slate-700 shadow-sm disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <Avatar
                    displayName={me.display_name}
                    email={me.email}
                    avatarUrl={me.avatar_url}
                    size={56}
                  />
                  <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity flex items-center justify-center">
                    {uploading ? (
                      <span className="text-white text-[10px] font-medium">Uploading…</span>
                    ) : (
                      <Camera className="h-4 w-4 text-white" strokeWidth={2} />
                    )}
                  </div>
                </button>
                {me.avatar_url && (
                  <button
                    type="button"
                    onClick={onAvatarRemoved}
                    disabled={uploading || updateMutation.isPending}
                    className="text-sm text-rose-600 dark:text-rose-400 hover:underline disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
              </div>
            </SettingRow>
            <SettingRow
              label="Display name"
              description="Shown in the header and on tasks you create."
            >
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                maxLength={100}
              />
            </SettingRow>
            <SettingRow
              label="Email"
              description="The address you sign in with."
            >
              <Input
                value={me.email ?? ""}
                readOnly
                className="bg-slate-50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 cursor-default"
              />
            </SettingRow>
            <div className="flex justify-end p-4">
              <Button
                type="submit"
                disabled={!dirty || updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </form>
      </section>

      {invitations.length > 0 && (
        <InvitationsSection invitations={invitations} />
      )}

      <DangerZoneSection me={me} />
    </div>
  );
}

function DangerZoneSection({ me }: { me: Me }) {
  const navigate = useNavigate();
  const deleteMutation = useDeleteAccount();
  const [open, setOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");

  const matches = confirmEmail.trim().toLowerCase() === (me.email ?? "").toLowerCase();

  async function onConfirm() {
    if (!matches) return;
    try {
      await deleteMutation.mutateAsync();
      // Sign out locally so the bearer-auth state doesn't linger after the
      // backend has deleted the user; without this the next request would
      // 401 and bounce through ?login=open with stale identity.
      await supabase.auth.signOut();
      toast.success("Account deleted.");
      navigate("/", { replace: true });
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to delete account";
      toast.error(detail);
    }
  }

  return (
    <>
      <section className="space-y-4">
        <h2 className="text-xl font-medium text-red-700 dark:text-red-400">Danger zone</h2>
        {/* Stacked block, not a SettingRow: the description is long enough
            that splitting it into a narrow label column made it wrap badly.
            Title up top, full-width prose, then the destructive button at
            the bottom-right where it doesn't compete with the text. */}
        <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 p-5 space-y-4">
          <div className="space-y-2">
            <h3 className="font-medium text-red-900 dark:text-red-300">Delete account</h3>
            <p className="text-sm text-red-900/70 dark:text-red-300/70 leading-relaxed">
              Permanently delete your account, every workspace you own (with
              all its projects, tasks, and sprints), and your membership in
              shared workspaces. Tasks you created or were assigned to in
              other workspaces stay, but become unassigned. This cannot be
              undone.
            </p>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => {
                setConfirmEmail("");
                setOpen(true);
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete account
            </Button>
          </div>
        </div>
      </section>

      {/* Strong confirm: GitHub-style email-typing gate. Empty/unmatched
          input keeps the destructive button disabled. */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          onClick={() => !deleteMutation.isPending && setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 shadow-2xl p-6 space-y-4"
          >
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Delete your account?
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                This will remove:
              </p>
              <ul className="mt-2 text-sm text-slate-600 dark:text-slate-400 list-disc list-inside space-y-0.5">
                <li>Every workspace you own + everything inside</li>
                <li>Your membership in shared workspaces</li>
                <li>Your notifications, watch subscriptions, and invites</li>
              </ul>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Tasks and comments you authored in other workspaces stay, but
                show as <span className="italic">Someone</span> afterwards.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Type{" "}
                <span className="font-mono text-slate-900 dark:text-slate-100">{me.email}</span>{" "}
                to confirm
              </label>
              <Input
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder={me.email ?? ""}
                disabled={deleteMutation.isPending}
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={onConfirm}
                disabled={!matches || deleteMutation.isPending}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                {deleteMutation.isPending
                  ? "Deleting…"
                  : "Permanently delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function InvitationsSection({ invitations }: { invitations: Invitation[] }) {
  const navigate = useNavigate();
  const acceptMutation = useAcceptInvitation();
  const declineMutation = useDeclineInvitation();

  async function onAccept(inv: Invitation) {
    try {
      await acceptMutation.mutateAsync(inv.id);
      toast.success(`Joined ${inv.workspace_name ?? "workspace"}`);
      if (inv.workspace_slug) navigate(`/w/${inv.workspace_slug}`);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to accept invitation";
      toast.error(detail);
    }
  }

  async function onDecline(inv: Invitation) {
    try {
      await declineMutation.mutateAsync(inv.id);
      toast.success("Invitation declined");
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to decline";
      toast.error(detail);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-baseline gap-2">
        <h2 className="text-xl font-medium text-slate-900 dark:text-slate-100 dark:text-slate-100">
          Workspace invitations
        </h2>
        <span className="text-sm text-slate-400 dark:text-slate-500 tabular-nums">
          {invitations.length}
        </span>
      </div>
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
        {invitations.map((inv) => {
          const inviter =
            inv.invited_by_display_name ??
            inv.invited_by_email ??
            "Someone";
          const accepting =
            acceptMutation.isPending && acceptMutation.variables === inv.id;
          const declining =
            declineMutation.isPending && declineMutation.variables === inv.id;
          const busy = accepting || declining;
          const sent = new Date(inv.created_at).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          });

          return (
            <div
              key={inv.id}
              className="grid grid-cols-[1fr_auto] items-center gap-4 p-5"
            >
              <div className="min-w-0">
                <p className="text-slate-900 dark:text-slate-100 leading-snug">
                  <span className="font-semibold">{inviter}</span> invited you
                  to{" "}
                  <span className="font-semibold">
                    {inv.workspace_name ?? "a workspace"}
                  </span>{" "}
                  as <span className="font-medium">{inv.role}</span>
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Sent {sent}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => onAccept(inv)}
                >
                  {accepting ? "Joining…" : "Accept"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onDecline(inv)}
                >
                  Decline
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    // Left column flexes (so the description gets room to breathe), right
    // column is a fixed 320px so inputs don't stretch to ridiculous widths.
    <div className="grid grid-cols-[1fr_320px] items-center gap-6 p-5">
      <div>
        <div className="font-medium text-slate-900 dark:text-slate-100">{label}</div>
        {description && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
