import { Navigate } from "react-router-dom";

import { useAuth } from "@/lib/auth";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading…</p>
      </div>
    );
  }
  if (!session) {
    return <Navigate to="/?login=open" replace />;
  }
  return <>{children}</>;
}
