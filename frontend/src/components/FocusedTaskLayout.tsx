import { useState } from "react";
import { Link, Outlet, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AgentPanel } from "@/components/AgentPanel";
import { useWorkspaces } from "@/features/workspaces/api";
import { useProjects } from "@/features/projects/api";

// Slim chrome for the standalone single-task page. No left nav — just a back
// link, a breadcrumb, and the project AI (focused on the task in view). The
// task route is mounted under this instead of WorkspaceLayout so the page
// reads as "this one task". Workspace/project are derived from the URL params
// + already-warm React Query caches (same pattern as TaskDetailModal).
export function FocusedTaskLayout() {
  const { wsSlug, pKey, identifier } = useParams();
  const navigate = useNavigate();
  const [agentOpen, setAgentOpen] = useState(false);

  const { data: workspaces = [] } = useWorkspaces();
  const ws = workspaces.find((w) => w.slug === wsSlug);
  const { data: projects = [] } = useProjects(ws?.id ?? "");
  const project = projects.find((p) => p.key === pKey);

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 dark:border-neutral-800 bg-white/90 dark:bg-neutral-950/90 backdrop-blur px-4 py-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <nav className="flex min-w-0 items-center gap-1.5 text-sm text-slate-400 dark:text-neutral-500">
          <Link to={`/w/${wsSlug}`} className="truncate hover:underline">
            {ws?.name ?? wsSlug}
          </Link>
          <span>/</span>
          <Link to={`/w/${wsSlug}/p/${pKey}/board`} className="hover:underline">
            {pKey}
          </Link>
          <span>/</span>
          <span className="text-slate-600 dark:text-neutral-300">{identifier}</span>
        </nav>
        <div className="ml-auto">
          <Button
            type="button"
            variant="outline"
            aria-label="AI assistant"
            onClick={() => setAgentOpen(true)}
            className="gap-1.5"
          >
            <Sparkles className="h-4 w-4 text-[var(--brand)]" strokeWidth={2} />
            Ask AI
          </Button>
        </div>
      </header>

      <main className="px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>

      <AgentPanel
        open={agentOpen}
        onClose={() => setAgentOpen(false)}
        projectId={project?.id ?? ""}
        projectName={project?.name ?? ""}
        wsSlug={wsSlug ?? ""}
        focusTask={identifier}
      />
    </div>
  );
}
