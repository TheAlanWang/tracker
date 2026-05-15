import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { PersonalLayout } from "@/components/PersonalLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { WorkspaceLayout } from "@/components/WorkspaceLayout";
import AuthCallback from "@/pages/AuthCallback";
import Backlog from "@/pages/Backlog";
import Board from "@/pages/Board";
import Browse from "@/pages/Browse";
import Dashboard from "@/pages/Dashboard";
import Home from "@/pages/Home";
import Inbox from "@/pages/Inbox";
import IssueDetail from "@/pages/IssueDetail";
import IssueList from "@/pages/IssueList";
import Login from "@/pages/Login";
import MyIssues from "@/pages/MyIssues";
import Onboarding from "@/pages/Onboarding";
import ProfileSettings from "@/pages/ProfileSettings";
import ProjectSettings from "@/pages/ProjectSettings";
import SprintDetail from "@/pages/SprintDetail";
import SprintList from "@/pages/SprintList";
import WorkspaceHome from "@/pages/WorkspaceHome";
import WorkspaceSettings from "@/pages/WorkspaceSettings";

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
          element={
            <ProtectedRoute>
              <PersonalLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/settings/profile" element={<ProfileSettings />} />
        </Route>
        <Route
          path="/browse/:identifier"
          element={
            <ProtectedRoute>
              <Browse />
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
          <Route path="inbox" element={<Inbox />} />
          <Route path="my-issues" element={<MyIssues />} />
          <Route path="p/:pKey/list" element={<IssueList />} />
          <Route path="p/:pKey/issues/:identifier" element={<IssueDetail />} />
          <Route path="p/:pKey/board" element={<Board />} />
          <Route path="p/:pKey/sprints" element={<SprintList />} />
          <Route path="p/:pKey/sprints/:sprintId" element={<SprintDetail />} />
          <Route path="p/:pKey/backlog" element={<Backlog />} />
          <Route path="p/:pKey/settings" element={<ProjectSettings />} />
          <Route path="settings" element={<WorkspaceSettings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
