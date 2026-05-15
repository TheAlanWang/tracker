import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentUser, useUpdateProfile } from "@/hooks/useCurrentUser";

export default function ProfileSettings() {
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
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold text-slate-900">Profile Settings</h1>

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

          <Button type="submit" size="sm" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </form>
      </section>
    </div>
  );
}
