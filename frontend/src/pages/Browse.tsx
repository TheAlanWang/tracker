import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { apiClient } from "@/api/client";

type ResolveResponse = {
  workspace_slug: string;
  project_key: string;
  issue_id: string;
  identifier: string;
};

export default function Browse() {
  const { identifier } = useParams<{ identifier: string }>();
  const navigate = useNavigate();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!identifier) {
      setNotFound(true);
      return;
    }

    apiClient
      .get<ResolveResponse>(`/resolve/identifier/${identifier}`)
      .then(({ data }) => {
        navigate(
          `/w/${data.workspace_slug}/p/${data.project_key}/issues/${data.identifier}`,
          { replace: true },
        );
      })
      .catch(() => {
        setNotFound(true);
      });
  }, [identifier, navigate]);

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-lg font-medium text-slate-700">Issue not found</p>
        <a href="/" className="text-sm text-blue-600 hover:underline">
          Back to home
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-muted-foreground">Resolving…</p>
    </div>
  );
}
