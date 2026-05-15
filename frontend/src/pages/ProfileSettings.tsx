import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentUser, useUpdateProfile } from "@/hooks/useCurrentUser";

export default function ProfileSettings() {
  const { wsSlug } = useParams();
  const navigate = useNavigate();
  const { data: me } = useCurrentUser();
  const updateMutation = useUpdateProfile();

  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    if (me) {
      setDisplayName(me.display_name ?? "");
    }
  }, [me]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
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

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Profile Settings</h1>

      <div className="grid grid-cols-[200px_1fr] gap-8">
        {/* Left column: sections */}
        <aside className="space-y-1">
          <p className="text-xs uppercase text-slate-400 font-medium px-2 pb-1">
            Account
          </p>
          <button
            type="button"
            className="block w-full text-left rounded px-2 py-1.5 text-sm bg-slate-100 font-medium"
          >
            Profile
          </button>
          <button
            type="button"
            onClick={() => navigate(`/w/${wsSlug}/settings`)}
            className="block w-full text-left rounded px-2 py-1.5 text-sm hover:bg-slate-50 mt-3"
          >
            ← Back to workspace settings
          </button>
        </aside>

        {/* Right column: settings */}
        <div className="space-y-8 min-w-0">
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">General</h2>
            <form onSubmit={onSave} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="profile-email">Email</Label>
                <Input
                  id="profile-email"
                  type="email"
                  value={me?.email ?? ""}
                  readOnly
                  className="bg-slate-50 text-muted-foreground cursor-default"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="profile-display-name">Display name</Label>
                <Input
                  id="profile-display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  maxLength={100}
                />
              </div>

              <Button
                type="submit"
                size="sm"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
