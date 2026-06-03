// Browse: short-link redirector for task identifiers.
//
// `/browse/:identifier` (e.g. /browse/TES-12) resolves the project + workspace
// the task belongs to, then redirects to the task's canonical URL. Used by
// notifications and externally-shared links where the workspace/project
// route isn't known up front.

import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useResolveIdentifier } from "@/features/tasks/api";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function Browse() {
  useDocumentTitle("Browse");
  const { identifier } = useParams<{ identifier: string }>();
  const navigate = useNavigate();

  // A bare identifier can match tasks in several of the user's workspaces
  // (same project key + number). Hint the resolver with the workspace the user
  // was last in (set by WorkspaceLayout) so the overwhelmingly common case —
  // browsing a link from your current workspace — lands on the right task.
  const preferWorkspace =
    localStorage.getItem("tracker.lastWorkspaceSlug") ?? undefined;
  const { data, isError, isPending } = useResolveIdentifier(
    identifier ?? "",
    preferWorkspace,
  );

  // Redirect to the task's canonical URL on a successful resolve. Failed
  // resolves fall through to the "not found" branch below.
  useEffect(() => {
    if (!data) return;
    navigate(
      `/w/${data.workspace_slug}/p/${data.project_key}/tasks/${data.identifier}`,
      { replace: true },
    );
  }, [data, navigate]);

  if (!identifier || isError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-lg font-medium text-slate-700 dark:text-neutral-300">Task not found</p>
        <a href="/" className="text-sm text-blue-600 hover:underline">
          Back to home
        </a>
      </div>
    );
  }

  // isPending or successfully resolved (redirect in flight)
  void isPending;
  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-muted-foreground">Resolving…</p>
    </div>
  );
}
