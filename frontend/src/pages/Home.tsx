import { useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { useCurrentUser } from "@/hooks/useCurrentUser";

const LAST_WORKSPACE_KEY = "tracker.lastWorkspaceSlug";

export default function Home() {
  const { data: me, isLoading } = useCurrentUser();
  const navigate = useNavigate();

  useEffect(() => {
    if (!me) return;
    if (me.workspaces.length === 0) {
      navigate("/onboarding", { replace: true });
      return;
    }
    const stored = localStorage.getItem(LAST_WORKSPACE_KEY);
    const target = me.workspaces.find((w) => w.slug === stored) ?? me.workspaces[0];
    navigate(`/w/${target.slug}`, { replace: true });
  }, [me, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading…</p>
      </div>
    );
  }

  // While effect is firing, return nothing
  return null;
}
