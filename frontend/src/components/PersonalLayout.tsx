import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { supabase } from "@/lib/supabase";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/settings/profile", label: "Profile" },
];

export function PersonalLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: me } = useCurrentUser();

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) toast.error(error.message);
  }

  function backToWorkspace() {
    const last = localStorage.getItem("tracker.lastWorkspaceSlug");
    navigate(last ? `/w/${last}` : "/");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={backToWorkspace}
              className="font-semibold text-slate-900 hover:text-slate-700"
            >
              tracker
            </button>
            <nav className="flex items-center gap-1 text-sm">
              {NAV_ITEMS.map((item) => {
                const active = location.pathname === item.to;
                return (
                  <button
                    key={item.to}
                    type="button"
                    onClick={() => navigate(item.to)}
                    className={
                      active
                        ? "rounded px-3 py-1 bg-slate-100 text-slate-900 font-medium"
                        : "rounded px-3 py-1 text-slate-600 hover:bg-slate-100"
                    }
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500 text-xs">
              {me?.display_name ?? me?.email}
            </span>
            <Button variant="outline" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
