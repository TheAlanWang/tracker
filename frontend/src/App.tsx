import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { WorkspaceLayout } from "@/components/WorkspaceLayout";
import AuthCallback from "@/pages/AuthCallback";
import Home from "@/pages/Home";
import IssueDetail from "@/pages/IssueDetail";
import IssueList from "@/pages/IssueList";
import Login from "@/pages/Login";
import Onboarding from "@/pages/Onboarding";
import WorkspaceHome from "@/pages/WorkspaceHome";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <Onboarding />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />
        <Route
          path="/w/:wsSlug"
          element={
            <ProtectedRoute>
              <WorkspaceLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<WorkspaceHome />} />
          <Route path="p/:pKey/list" element={<IssueList />} />
          <Route path="p/:pKey/issues/:identifier" element={<IssueDetail />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
