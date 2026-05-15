import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { useEffect } from "react";

import { useProjects } from "@/features/projects/api";
import { useWorkspaces } from "@/features/workspaces/api";

const TABS = [
  { to: "board", label: "Board" },
  { to: "list", label: "List" },
  { to: "backlog", label: "Backlog" },
  { to: "sprints", label: "Sprints" },
] as const;

export function ProjectLayout() {
  const { wsSlug, pKey } = useParams();
  const navigate = useNavigate();

  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const { data: projects = [], isLoading } = useProjects(currentWs?.id ?? "");
  const currentProject = projects.find((p) => p.key === pKey);

  useEffect(() => {
    if (!isLoading && currentWs && !currentProject) {
      navigate(`/w/${wsSlug}`, { replace: true });
    }
  }, [isLoading, currentWs, currentProject, navigate, wsSlug]);

  if (!currentProject) return null;

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? "border-b-2 border-slate-900 px-3 py-2 text-sm font-medium text-slate-900"
      : "border-b-2 border-transparent px-3 py-2 text-sm text-slate-500 hover:text-slate-900";

  return (
    <div className="space-y-0">
      <div className="border-b border-slate-200 -mt-8 -mx-8 px-8 pt-8 pb-0 bg-white">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">
            {currentProject.key}
          </span>
          <h1 className="text-2xl font-bold text-slate-900">
            {currentProject.name}
          </h1>
        </div>
        <nav className="mt-4 flex items-center gap-1">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={`/w/${wsSlug}/p/${pKey}/${t.to}`}
              className={tabClass}
              end={false}
            >
              {t.label}
            </NavLink>
          ))}
          <div className="ml-auto">
            <NavLink
              to={`/w/${wsSlug}/p/${pKey}/settings`}
              className={tabClass}
              title="Project settings"
              end={false}
            >
              ⚙
            </NavLink>
          </div>
        </nav>
      </div>
      <div className="pt-6">
        <Outlet />
      </div>
    </div>
  );
}
