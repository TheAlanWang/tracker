import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const { data: me, isLoading, error } = useCurrentUser();

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) toast.error(error.message);
  }

  return (
    <div className="min-h-screen p-8 bg-slate-50">
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Welcome to tracker</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && <p>Loading…</p>}
          {error && (
            <p className="text-red-600">Failed to load profile: {error.message}</p>
          )}
          {me && (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Signed in as</p>
              <p className="font-medium">{me.email ?? me.id}</p>
            </div>
          )}
          <Button onClick={handleSignOut} variant="outline" className="w-full">
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
