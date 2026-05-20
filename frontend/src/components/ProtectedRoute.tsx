import { Navigate } from "react-router-dom";

import { PageSpinner } from "@/components/PageSpinner";
import { useAuth } from "@/lib/auth";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) {
    return <PageSpinner />;
  }
  if (!session) {
    return <Navigate to="/?login=open" replace />;
  }
  return <>{children}</>;
}
