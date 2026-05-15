import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  const dirty = (me?.display_name ?? "") !== displayName;

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

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <header>
        <h1 className="text-3xl font-semibold text-slate-900">Profile Settings</h1>
        <p className="mt-2 text-slate-500">
          Your personal account info — display name and email.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-medium text-slate-900">General settings</h2>
        <form onSubmit={onSave}>
          <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-200">
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
                value={me?.email ?? ""}
                readOnly
                className="bg-slate-50 text-slate-500 cursor-default"
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
    </div>
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
    <div className="grid grid-cols-[280px_1fr] items-start gap-6 p-5">
      <div>
        <div className="font-medium text-slate-900">{label}</div>
        {description && (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
