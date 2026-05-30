// Profile Settings page.
//
// Three sections, all rendered inside <SettingsLayout> so the page shares
// the same left-rail (Account → Profile, Workspaces, Projects) as Workspace
// Settings and Project Settings — one consistent "settings space" instead
// of three layouts.
//
//   1. General settings — edit display name, view (read-only) sign-in email.
//      Display name is what the rest of the app uses for greetings, avatars,
//      and activity attribution; missing display name silently falls back to
//      email in those surfaces.
//   2. Sign-in methods — view linked auth providers, add a password to an
//      OAuth-only account, link/unlink Google. The "primary method + bind
//      others" pattern (à la GitHub/Linear): the login page stays simple,
//      and adding methods is gated behind an authenticated session, so we
//      never need an anonymous "does this email exist?" lookup.
//   3. Workspace invitations — pending invites for the current user, with
//      accept/decline. Renders only when there are pending invitations.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Pencil, Trash2 } from "lucide-react";

import { Avatar } from "@/components/Avatar";
import { isUploadedAvatar } from "@/lib/avatar";
import { PROFILE_SETTINGS_SECTIONS } from "@/lib/navTargets";
import { AVATAR_COLORS } from "@/lib/avatarColors";
import { InlineSpinner } from "@/components/PageSpinner";
import { SettingsLayout } from "@/components/SettingsLayout";
import { useSectionSidebar } from "@/hooks/useSectionSidebar";
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
import { useAuthIdentities } from "@/hooks/useAuthIdentities";
import { supabase } from "@/lib/supabase";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const AVATAR_BUCKET = "avatars";
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export default function ProfileSettings() {
  useDocumentTitle("Profile Settings");
  const { data: me } = useCurrentUser();
  const { data: invitations = [] } = useMyInvitations();

  // Register tier-2 in-page sub-nav for the profile page. Sections appear
  // in WorkspaceLayout's left rail beside SettingsSidebar; clicking one
  // smooth-scrolls to the matching <section id=...> on this page.
  // Invitations only listed when there's actually something to scroll to.
  // Stable sections come from the shared catalog; the transient Invitations
  // section is spliced in before Danger Zone only when there's one to show.
  const profileSections = [...PROFILE_SETTINGS_SECTIONS];
  if (invitations.length > 0) {
    profileSections.splice(profileSections.length - 1, 0, {
      id: "profile-invitations",
      label: "Invitations",
    });
  }
  useSectionSidebar({ title: "Profile", sections: profileSections });

  if (!me) {
    return (
      <SettingsLayout>
        <InlineSpinner />
      </SettingsLayout>
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
  const [avatarColor, setAvatarColor] = useState<string | null>(me.avatar_color);
  const [uploading, setUploading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editPopoverRef = useRef<HTMLDivElement>(null);

  // Close popover on click outside or Escape — same pattern as the profile
  // dropdown in WorkspaceLayout.
  useEffect(() => {
    if (!editOpen) return;
    const onClick = (e: MouseEvent) => {
      if (
        editPopoverRef.current &&
        !editPopoverRef.current.contains(e.target as Node)
      ) {
        setEditOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [editOpen]);

  const dirty =
    (me.display_name ?? "") !== displayName || me.avatar_color !== avatarColor;

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    try {
      // For string fields, the backend convention is: empty string clears,
      // undefined leaves untouched. We only send fields that actually changed.
      const payload: {
        display_name?: string;
        avatar_color?: string;
      } = {};
      if ((me.display_name ?? "") !== displayName) {
        payload.display_name = displayName || undefined;
      }
      if (me.avatar_color !== avatarColor) {
        // null → "" clears the stored color; non-null → set.
        payload.avatar_color = avatarColor ?? "";
      }
      await updateMutation.mutateAsync(payload);
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

  return (
    <SettingsLayout>
      <header className="mb-6">
        <h1 className="text-3xl font-semibold text-slate-900 dark:text-neutral-200">Profile Settings</h1>
        <p className="mt-2 text-slate-500 dark:text-neutral-400">
          Your personal account info — display name and email.
        </p>
      </header>
      <div className="space-y-10">
      <section id="profile-general" className="space-y-4 scroll-mt-4">
        <h2 className="text-xl font-medium text-slate-900 dark:text-neutral-200 dark:text-neutral-200">General Settings</h2>
        <form onSubmit={onSave}>
          <div className="rounded-lg border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 divide-y divide-slate-200 dark:divide-neutral-800">
            <SettingRow
              label="Avatar"
              description={
                <>
                  Upload an image or pick a background color.
                  <br />
                  PNG / JPEG / WebP / GIF, up to 2 MB.
                </>
              }
            >
              <div className="flex justify-start">
                <div ref={editPopoverRef} className="relative">
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
                  onClick={() => setEditOpen((v) => !v)}
                  disabled={uploading || updateMutation.isPending}
                  aria-label="Edit avatar"
                  aria-expanded={editOpen}
                  className="group relative h-14 w-14 rounded-full overflow-hidden ring-1 ring-slate-200 dark:ring-neutral-700 shadow-sm disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <Avatar
                    displayName={me.display_name}
                    email={me.email}
                    avatarUrl={me.avatar_url}
                    color={avatarColor}
                    size={56}
                  />
                  <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity flex items-center justify-center">
                    {uploading ? (
                      <span className="text-white text-[10px] font-medium">Uploading…</span>
                    ) : (
                      <Pencil className="h-4 w-4 text-white" strokeWidth={2} />
                    )}
                  </div>
                </button>

                {editOpen && (
                  <div className="absolute left-0 top-full mt-2 w-60 rounded-lg border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg z-20 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        fileInputRef.current?.click();
                        setEditOpen(false);
                      }}
                      disabled={uploading}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800/50 disabled:opacity-60"
                    >
                      <Camera className="h-4 w-4" strokeWidth={1.7} />
                      {isUploadedAvatar(me.avatar_url) ? "Change photo" : "Upload new photo"}
                    </button>
                    {isUploadedAvatar(me.avatar_url) && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await updateMutation.mutateAsync({ avatar_url: "" });
                            toast.success("Photo removed");
                            setEditOpen(false);
                          } catch {
                            toast.error("Failed to remove photo");
                          }
                        }}
                        disabled={updateMutation.isPending}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800/50 disabled:opacity-60"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.7} />
                        Remove photo
                      </button>
                    )}
                    {!isUploadedAvatar(me.avatar_url) && (
                      <>
                        <div className="border-t border-slate-100 dark:border-neutral-800" />
                        <div className="px-3 py-2.5">
                          <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-neutral-400 font-semibold mb-2">
                            Background color
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            {AVATAR_COLORS.map((c) => (
                              <button
                                key={c.value}
                                type="button"
                                onClick={() => setAvatarColor(c.value)}
                                aria-label={`Use ${c.name} background`}
                                title={c.name}
                                className={`h-5 w-5 rounded-full ring-2 transition-shadow ${
                                  avatarColor === c.value
                                    ? "ring-slate-900 dark:ring-neutral-100"
                                    : "ring-transparent hover:ring-slate-300 dark:hover:ring-neutral-600"
                                }`}
                                style={{ backgroundColor: c.value }}
                              />
                            ))}
                          </div>
                          {avatarColor !== null && (
                            <button
                              type="button"
                              onClick={() => setAvatarColor(null)}
                              className="mt-2 text-xs text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-100"
                            >
                              Reset to default
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
              </div>
            </SettingRow>
            <SettingRow
              label="Display Name"
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
                className="bg-slate-50 dark:bg-neutral-800/40 text-slate-500 dark:text-neutral-400 cursor-default"
              />
            </SettingRow>
            <div className="flex justify-end p-4">
              <Button
                type="submit"
                className="min-w-28"
                disabled={!dirty || updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </form>
      </section>

      <SignInMethodsSection />

      {invitations.length > 0 && (
        <InvitationsSection invitations={invitations} />
      )}

        <DangerZoneSection me={me} />
      </div>
    </SettingsLayout>
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
      <section id="profile-danger" className="space-y-4 scroll-mt-4">
        <h2 className="text-xl font-medium text-red-700 dark:text-red-400">Danger Zone</h2>
        {/* Stacked block, not a SettingRow: the description is long enough
            that splitting it into a narrow label column made it wrap badly.
            Title up top, full-width prose, then the destructive button at
            the bottom-right where it doesn't compete with the text. */}
        <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 p-5 space-y-4">
          <div className="space-y-2">
            <h3 className="font-medium text-red-900 dark:text-red-300">Delete Account</h3>
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
              Delete Account
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
            className="w-full max-w-md rounded-xl bg-white dark:bg-neutral-900 shadow-2xl p-6 space-y-4"
          >
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-neutral-200">
                Delete your account?
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">
                This will remove:
              </p>
              <ul className="mt-2 text-sm text-slate-600 dark:text-neutral-400 list-disc list-inside space-y-0.5">
                <li>Every workspace you own + everything inside</li>
                <li>Your membership in shared workspaces</li>
                <li>Your notifications, watch subscriptions, and invites</li>
              </ul>
              <p className="mt-2 text-xs text-slate-500 dark:text-neutral-400">
                Tasks and comments you authored in other workspaces stay, but
                show as <span className="italic">Someone</span> afterwards.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-neutral-300">
                Type{" "}
                <span className="font-mono text-slate-900 dark:text-neutral-200">{me.email}</span>{" "}
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
    <section id="profile-invitations" className="space-y-4 scroll-mt-4">
      <div className="flex items-baseline gap-2">
        <h2 className="text-xl font-medium text-slate-900 dark:text-neutral-200 dark:text-neutral-200">
          Workspace invitations
        </h2>
        <span className="text-sm text-slate-400 dark:text-neutral-500 tabular-nums">
          {invitations.length}
        </span>
      </div>
      <div className="rounded-lg border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 divide-y divide-slate-200 dark:divide-neutral-800">
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
                <p className="text-slate-900 dark:text-neutral-200 leading-snug">
                  <span className="font-semibold">{inviter}</span> invited you
                  to{" "}
                  <span className="font-semibold">
                    {inv.workspace_name ?? "a workspace"}
                  </span>{" "}
                  as <span className="font-medium">{inv.role}</span>
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-neutral-400">Sent {sent}</p>
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

function SignInMethodsSection() {
  const { identities, refresh: refreshIdentities } = useAuthIdentities();
  const { data: me } = useCurrentUser();
  const [passwordModal, setPasswordModal] = useState<"set" | "change" | null>(
    null,
  );
  // Per-provider loading state — clicking Link Google shouldn't also gray
  // out the Link GitHub button, etc.
  const [linking, setLinking] = useState<"google" | "github" | null>(null);
  const [unlinking, setUnlinking] = useState<"google" | "github" | null>(null);

  // Pre-flight: still fetching the session or the /me payload. Render a
  // placeholder so the section's visual weight is stable when it appears.
  if (!identities || !me) {
    return (
      <section id="profile-signin" className="space-y-4 scroll-mt-4">
        <h2 className="text-xl font-medium text-slate-900 dark:text-neutral-200">
          Sign-In Methods
        </h2>
        <div className="rounded-lg border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          <InlineSpinner />
        </div>
      </section>
    );
  }

  const googleIdentity = identities.find((i) => i.provider === "google");
  // Unlink guard: Supabase's unlinkIdentity refuses when it would leave
  // the user with zero rows in auth.identities. Even though
  // signInWithPassword doesn't consult identities at all (it only checks
  // auth.users.encrypted_password), the unlink rule is strict. Match
  // that reality in the UI — only allow unlinking an OAuth provider
  // when there's another OAuth identity to fall back on. Adding GitHub
  // / Discord / etc. later will automatically unblock Unlink Google.
  //
  // Password is intentionally NOT part of this check — it's an orthogonal
  // sign-in mechanism, not an identity row. Set Password / Change Password
  // is controlled separately via me.has_password.
  const githubIdentity = identities.find((i) => i.provider === "github");
  const oauthIdentities = identities.filter((i) => i.provider !== "email");
  const wouldLockOut = oauthIdentities.length <= 1;

  async function handleLinkGoogle() {
    setLinking("google");
    // redirectTo: same page, so the user lands back on /profile and sees
    // the updated identities list. Supabase processes the URL fragment
    // on arrival; onAuthStateChange("USER_UPDATED") fires; the hook
    // refreshes; the row flips to "Linked as …".
    const { error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: window.location.href },
    });
    if (error) {
      toast.error(error.message);
      setLinking(null);
    }
    // On success the page navigates away to Google; no need to clear state.
  }

  async function handleUnlinkGoogle() {
    if (!googleIdentity || wouldLockOut) return;
    setUnlinking("google");
    try {
      const { error } = await supabase.auth.unlinkIdentity(googleIdentity);
      if (error) throw error;
      // Supabase's unlinkIdentity mutates the server but doesn't emit a
      // USER_UPDATED event the way linkIdentity / updateUser do, so the
      // useAuthIdentities hook stays stale unless we refresh by hand.
      await refreshIdentities();
      toast.success("Google account unlinked.");
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Failed to unlink";
      toast.error(detail);
    } finally {
      setUnlinking(null);
    }
  }

  async function handleLinkGitHub() {
    setLinking("github");
    const { error } = await supabase.auth.linkIdentity({
      provider: "github",
      options: { redirectTo: window.location.href },
    });
    if (error) {
      toast.error(error.message);
      setLinking(null);
    }
  }

  async function handleUnlinkGitHub() {
    if (!githubIdentity || wouldLockOut) return;
    setUnlinking("github");
    try {
      const { error } = await supabase.auth.unlinkIdentity(githubIdentity);
      if (error) throw error;
      await refreshIdentities();
      toast.success("GitHub account unlinked.");
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Failed to unlink";
      toast.error(detail);
    } finally {
      setUnlinking(null);
    }
  }

  return (
    <>
      <section id="profile-signin" className="space-y-4 scroll-mt-4">
        <h2 className="text-xl font-medium text-slate-900 dark:text-neutral-200">
          Sign-In Methods
        </h2>
        {/* Section-level meta hint: states the "at least one method"
            rule once instead of repeating it across rows. Lets each row's
            description stay self-contained (Password explains password,
            Google explains Google — neither references the other). */}
        <p className="-mt-2 text-sm text-slate-500 dark:text-neutral-400">
          Link a second account to enable unlinking. You can always sign in
          with your password.
        </p>
        <div className="rounded-lg border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 divide-y divide-slate-200 dark:divide-neutral-800">
          <SettingRow
            label="Password"
            description={
              me.has_password
                ? "Sign in with email and password."
                : "Not set. Add a password to sign in without Google."
            }
          >
            <div className="flex justify-end">
              <Button
                type="button"
                className="min-w-40"
                onClick={() =>
                  setPasswordModal(me.has_password ? "change" : "set")
                }
              >
                {me.has_password ? "Change Password" : "Set Password"}
              </Button>
            </div>
          </SettingRow>
          <SettingRow
            label="Google"
            description={
              googleIdentity
                ? `Linked as ${
                    (googleIdentity.identity_data?.email as string | undefined) ??
                    "your Google account"
                  }.`
                : "Not linked. Connect Google for one-click sign-in."
            }
          >
            <div className="flex justify-end">
              {googleIdentity ? (
                // Hide Unlink entirely when it would lock the user out —
                // an action they can't perform is just noise. The hint in
                // the section header tells the user how to get there
                // (link a second account first).
                wouldLockOut ? null : (
                  <Button
                    type="button"
                    className="min-w-40"
                    disabled={unlinking === "google"}
                    onClick={handleUnlinkGoogle}
                  >
                    {unlinking === "google" ? "Unlinking…" : "Unlink Google"}
                  </Button>
                )
              ) : (
                <Button
                  type="button"
                  className="min-w-40"
                  disabled={linking === "google"}
                  onClick={handleLinkGoogle}
                >
                  {linking === "google" ? "Redirecting…" : "Link Google"}
                </Button>
              )}
            </div>
          </SettingRow>
          <SettingRow
            label="GitHub"
            description={
              githubIdentity
                ? `Linked as ${
                    (githubIdentity.identity_data?.user_name as
                      | string
                      | undefined) ??
                    (githubIdentity.identity_data?.email as
                      | string
                      | undefined) ??
                    "your GitHub account"
                  }.`
                : "Not linked. Connect GitHub for one-click sign-in."
            }
          >
            <div className="flex justify-end">
              {githubIdentity ? (
                wouldLockOut ? null : (
                  <Button
                    type="button"
                    className="min-w-40"
                    disabled={unlinking === "github"}
                    onClick={handleUnlinkGitHub}
                  >
                    {unlinking === "github" ? "Unlinking…" : "Unlink GitHub"}
                  </Button>
                )
              ) : (
                <Button
                  type="button"
                  className="min-w-40"
                  disabled={linking === "github"}
                  onClick={handleLinkGitHub}
                >
                  {linking === "github" ? "Redirecting…" : "Link GitHub"}
                </Button>
              )}
            </div>
          </SettingRow>
        </div>
      </section>

      {passwordModal && (
        <PasswordModal
          mode={passwordModal}
          onClose={() => setPasswordModal(null)}
        />
      )}
    </>
  );
}

function PasswordModal({
  mode,
  onClose,
}: {
  mode: "set" | "change";
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Supabase's default minimum is 6, but 8 is the common product-default
  // and matches what LoginDialog enforces at sign-up.
  const longEnough = password.length >= 8;
  const matches = password === confirm;
  const canSubmit = longEnough && matches;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // updateUser({ password }) sets auth.users.encrypted_password. It does
      // NOT add a provider='email' row to auth.identities — that's why we
      // can't use the identities array to gate the Set/Change button.
      // The backend's me.has_password (computed from encrypted_password IS
      // NOT NULL via the user_has_password() SQL function) is the signal.
      // Invalidate ["me"] below so the Password row flips immediately.
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      // Force a /me refetch so me.has_password reflects the new state.
      // The auth state change event from supabase-js refreshes identities
      // automatically but doesn't touch our React Query cache for /me.
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success(mode === "set" ? "Password set." : "Password updated.");
      onClose();
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Failed to update";
      toast.error(detail);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
      onClick={() => !submitting && onClose()}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-xl bg-white dark:bg-neutral-900 shadow-2xl p-6 space-y-4"
      >
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-neutral-200">
            {mode === "set" ? "Set a password" : "Change password"}
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">
            {mode === "set"
              ? "Add an email + password login alongside your existing methods."
              : "Enter a new password. You'll still be signed in afterward."}
          </p>
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700 dark:text-neutral-300">
              New password
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              autoFocus
              minLength={8}
              autoComplete="new-password"
            />
            {password.length > 0 && !longEnough && (
              <p className="text-xs text-red-600 dark:text-red-400">
                At least 8 characters.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700 dark:text-neutral-300">
              Confirm new password
            </label>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={submitting}
              minLength={8}
              autoComplete="new-password"
            />
            {confirm.length > 0 && !matches && (
              <p className="text-xs text-red-600 dark:text-red-400">
                Passwords don't match.
              </p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit || submitting}>
            {submitting
              ? "Saving…"
              : mode === "set"
              ? "Set password"
              : "Update password"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    // Left column flexes (so the description gets room to breathe), right
    // column is a fixed 320px so inputs don't stretch to ridiculous widths.
    <div className="grid grid-cols-[1fr_320px] items-center gap-6 p-5">
      <div>
        <div className="font-medium text-slate-900 dark:text-neutral-200">{label}</div>
        {description && (
          <p className="mt-1 text-sm text-slate-500 dark:text-neutral-400">{description}</p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
