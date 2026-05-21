import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { PageSpinner } from "@/components/PageSpinner";
import { useProjects } from "@/features/projects/api";
import { useWorkspaces } from "@/features/workspaces/api";

export default function WorkspaceHome() {
  const { wsSlug } = useParams();
  const navigate = useNavigate();
  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const { data: projects = [], isLoading } = useProjects(currentWs?.id ?? "");

  // If the workspace has projects, jump to the first project's board.
  useEffect(() => {
    if (!isLoading && projects.length > 0) {
      navigate(`/w/${wsSlug}/p/${projects[0].key}/board`, { replace: true });
    }
  }, [isLoading, projects, wsSlug, navigate]);

  if (!currentWs) return null;

  if (isLoading) {
    return <PageSpinner />;
  }

  if (projects.length === 0) {
    return (
      <div className="max-w-xl space-y-3">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{currentWs.name}</h1>
        <p className="text-slate-600 dark:text-slate-400">
          No projects yet. Click <span className="font-semibold">+</span> next to{" "}
          <span className="font-semibold">PROJECTS</span> in the left sidebar to create your first.
        </p>
      </div>
    );
  }

  // Redirecting — render nothing
  return null;
}
