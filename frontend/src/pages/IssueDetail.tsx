import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  useComments,
  useCreateComment,
  useDeleteComment,
} from "@/features/comments/api";
import {
  IssuePriority,
  IssueStatus,
  useDeleteIssue,
  useIssue,
  useIssues,
  useUpdateIssue,
} from "@/features/issues/api";
import { useProjects } from "@/features/projects/api";
import { useSprints } from "@/features/sprints/api";
import { useWorkspaces } from "@/features/workspaces/api";

const STATUSES: IssueStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "cancelled",
];

const PRIORITIES: IssuePriority[] = [
  "no_priority",
  "urgent",
  "high",
  "medium",
  "low",
];

export default function IssueDetail() {
  const { wsSlug, pKey, identifier } = useParams();
  const navigate = useNavigate();

  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const { data: projects = [] } = useProjects(currentWs?.id ?? "");
  const currentProject = projects.find((p) => p.key === pKey);

  // Resolve identifier → issue via the project's list, then fetch the
  // canonical record via /issues/{id}.
  const { data: issuesList = [] } = useIssues(currentProject?.id ?? "");
  const issueFromList = issuesList.find((i) => i.identifier === identifier);
  const { data: issue } = useIssue(issueFromList?.id ?? "");

  const updateMutation = useUpdateIssue(issue?.id ?? "");
  const deleteMutation = useDeleteIssue();

  const { data: sprints = [] } = useSprints(currentProject?.id ?? "");

  const [titleDraft, setTitleDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");

  useEffect(() => {
    if (issue) {
      setTitleDraft(issue.title);
      setDescDraft(issue.description);
    }
  }, [issue]);

  const { data: comments = [] } = useComments(issue?.id ?? "");
  const createCommentMutation = useCreateComment(issue?.id ?? "");
  const deleteCommentMutation = useDeleteComment(issue?.id ?? "");
  const [commentDraft, setCommentDraft] = useState("");

  async function onPostComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentDraft.trim()) return;
    try {
      await createCommentMutation.mutateAsync({ body: commentDraft });
      setCommentDraft("");
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to post comment";
      toast.error(detail);
    }
  }

  async function onDeleteComment(commentId: string) {
    if (!confirm("Delete this comment?")) return;
    try {
      await deleteCommentMutation.mutateAsync(commentId);
    } catch (err) {
      toast.error("Failed to delete comment");
    }
  }

  if (!issue) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  async function save<K extends keyof typeof issue>(
    field: K,
    value: (typeof issue)[K],
  ) {
    try {
      await updateMutation.mutateAsync({ [field]: value } as never);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to update";
      toast.error(detail);
    }
  }

  async function onDelete() {
    if (!confirm(`Delete ${issue.identifier}?`)) return;
    try {
      await deleteMutation.mutateAsync(issue.id);
      toast.success("Issue deleted");
      navigate(`/w/${wsSlug}/p/${pKey}/list`);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to delete";
      toast.error(detail);
    }
  }

  return (
    <div className="grid grid-cols-3 gap-8 max-w-6xl">
      <div className="col-span-2 space-y-4">
        <p className="font-mono text-xs text-muted-foreground">
          {issue.identifier}
        </p>
        <input
          className="w-full bg-transparent text-2xl font-bold text-slate-900 outline-none focus:bg-slate-100 rounded px-1 py-0.5 -mx-1"
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => {
            if (titleDraft !== issue.title && titleDraft.length > 0) {
              save("title", titleDraft);
            }
          }}
        />
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Description
          </p>
          <textarea
            className="w-full rounded border border-slate-200 bg-white p-2 text-sm"
            rows={8}
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            onBlur={() => {
              if (descDraft !== issue.description) {
                save("description", descDraft);
              }
            }}
          />
        </div>
        <Button
          variant="outline"
          onClick={onDelete}
          disabled={deleteMutation.isPending}
          className="text-red-600 hover:bg-red-50"
        >
          Delete issue
        </Button>

        <section className="space-y-3 pt-6 border-t border-slate-200">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">
            Comments ({comments.length})
          </h2>
          {comments.map((c) => (
            <div key={c.id} className="rounded border border-slate-200 bg-white p-3">
              <div className="flex justify-between items-baseline">
                <p className="text-xs text-muted-foreground">
                  {c.author_id ?? "Unknown"} ·{" "}
                  {new Date(c.created_at).toLocaleString()}
                </p>
                <button
                  type="button"
                  className="text-xs text-red-600 hover:underline"
                  onClick={() => onDeleteComment(c.id)}
                >
                  Delete
                </button>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
            </div>
          ))}
          <form onSubmit={onPostComment} className="space-y-2">
            <textarea
              className="w-full rounded border border-slate-300 bg-white p-2 text-sm"
              rows={3}
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              placeholder="Write a comment…"
              maxLength={10000}
            />
            <Button type="submit" size="sm" disabled={createCommentMutation.isPending || !commentDraft.trim()}>
              {createCommentMutation.isPending ? "Posting…" : "Post comment"}
            </Button>
          </form>
        </section>
      </div>

      <aside className="space-y-4 border-l border-slate-200 pl-6">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Status
          </p>
          <select
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
            value={issue.status}
            onChange={(e) => save("status", e.target.value as IssueStatus)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Priority
          </p>
          <select
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
            value={issue.priority}
            onChange={(e) => save("priority", e.target.value as IssuePriority)}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Due date
          </p>
          <input
            type="date"
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
            value={issue.due_date ?? ""}
            onChange={(e) =>
              save("due_date", e.target.value === "" ? null : e.target.value)
            }
          />
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Sprint
          </p>
          <select
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
            value={issue.sprint_id ?? ""}
            onChange={(e) =>
              save("sprint_id", e.target.value === "" ? null : e.target.value)
            }
          >
            <option value="">Backlog (no sprint)</option>
            {sprints
              .filter((s) => s.status !== "completed")
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.status === "active" ? "(active)" : ""}
                </option>
              ))}
          </select>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Reporter
          </p>
          <p className="text-xs text-slate-500">{issue.reporter_id ?? "—"}</p>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Created
          </p>
          <p className="text-xs text-slate-500">
            {new Date(issue.created_at).toLocaleString()}
          </p>
        </div>
      </aside>
    </div>
  );
}
