import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";

import { PageSpinner } from "@/components/PageSpinner";
import { ProjectLayout } from "@/components/ProjectLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { WorkspaceLayout } from "@/components/WorkspaceLayout";
import { useAuth } from "@/lib/auth";
import Archive from "@/pages/Archive";
import AuthCallback from "@/pages/AuthCallback";
import Backlog from "@/pages/Backlog";
import Board from "@/pages/Board";
import Browse from "@/pages/Browse";
import Dashboard from "@/pages/Dashboard";
import Goals from "@/pages/Goals";
import Home from "@/pages/Home";
import Landing from "@/pages/Landing";
import TaskDetail from "@/pages/TaskDetail";
import TaskStandalone from "@/pages/TaskStandalone";
import TaskList from "@/pages/TaskList";
import MyIssues from "@/pages/MyIssues";
import Billing from "@/pages/Billing";
import NotFound from "@/pages/NotFound";
import ProfileSettings from "@/pages/ProfileSettings";
import ProjectSettings from "@/pages/ProjectSettings";
import SprintDetail from "@/pages/SprintDetail";
import SprintList from "@/pages/SprintList";
import WorkspaceHome from "@/pages/WorkspaceHome";
import WorkspaceSettings from "@/pages/WorkspaceSettings";

// Root route: anonymous visitors see the marketing landing; signed-in users
// flow into the workspace via Home (which redirects to the last workspace).
function RootRoute() {
  const { session, loading } = useAuth();
  if (loading) {
    return <PageSpinner />;
  }
  return session ? <Home /> : <Landing />;
}

export default function App() {
  return (
    <BrowserRouter>
      {/* Vercel Speed Insights — real-user Core Web Vitals (LCP / CLS /
          INP / TTFB), surfaced in Vercel Dashboard → Speed Insights. No
          UI; just a beacon. Renders once at the root so it covers all
          routes incl. SPA navigations. */}
      <SpeedInsights />
      {/* Vercel Web Analytics — privacy-friendly page views / visitors /
          referrers. Same root-level mount so SPA route changes get
          tracked. Dashboard → Analytics tab. */}
      <Analytics />
      <Routes>
        {/* Legacy /login URL — keep functional but redirect to landing with
            the modal auto-open. */}
        <Route
          path="/login"
          element={<Navigate to="/?login=open" replace />}
        />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/" element={<RootRoute />} />
        <Route
          path="/browse/:identifier"
          element={
            <ProtectedRoute>
              <Browse />
            </ProtectedRoute>
          }
        />
        {/* Chrome-less standalone task view (opened in a new tab from the
            task modal's expand button). No workspace sidebar / header. */}
        <Route
          path="/t/:identifier"
          element={
            <ProtectedRoute>
              <TaskStandalone />
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
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="goals" element={<Goals />} />
          <Route path="billing" element={<Billing />} />
          <Route path="my-issues" element={<MyIssues />} />
          <Route path="settings" element={<WorkspaceSettings />} />
          <Route path="profile" element={<ProfileSettings />} />
          <Route path="p/:pKey/tasks/:identifier" element={<TaskDetail />} />
          <Route path="p/:pKey/settings" element={<ProjectSettings />} />
          <Route path="p/:pKey" element={<ProjectLayout />}>
            <Route index element={<Navigate to="board" replace />} />
            <Route path="board" element={<Board />} />
            <Route path="list" element={<TaskList />} />
            <Route path="backlog" element={<Backlog />} />
            <Route path="sprints" element={<SprintList />} />
            <Route path="sprints/:sprintId" element={<SprintDetail />} />
            <Route path="archive" element={<Archive />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
