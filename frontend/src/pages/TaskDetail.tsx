import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { type Activity, useTaskActivity } from "@/features/activity/api";
import {
  useComments,
  useCreateComment,
  useDeleteComment,
} from "@/features/comments/api";
import {
  useAttachLabel,
  useDetachLabel,
  useTaskLabels,
  useLabels,
} from "@/features/labels/api";
import {
  TaskPriority,
  TaskStatus,
  useDeleteTask,
  useTask,
  useResolveIdentifier,
  useUpdateTask,
} from "@/features/tasks/api";
import { useMembers } from "@/features/members/api";
import { useProjects } from "@/features/projects/api";
import { useSprints } from "@/features/sprints/api";
import { useWorkspaces } from "@/features/workspaces/api";

const STATUSES: TaskStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "cancelled",
];

const PRIORITIES: TaskPriority[] = [
  "no_priority",
  "urgent",
  "high",
  "medium",
  "low",
];

function formatActivity(a: Activity): string {
  const actor = a.actor_id ? `${a.actor_id.slice(0, 8)}…` : "Someone";
  const p = a.payload;
  switch (a.action) {
    case "status_changed":
      return `${actor} changed status from ${p["from"]} to ${p["to"]}`;
    case "priority_changed":
      return `${actor} changed priority from ${p["from"]} to ${p["to"]}`;
    case "assignee_changed":
      return `${actor} changed assignee`;
    case "sprint_changed":
      return `${actor} changed sprint`;
    case "commented":
      return `${actor} commented`;
    case "created":
      return `${actor} created this task`;
    default:
      return `${actor} made a change`;
  }
}

export default function TaskDetail() {
  const { wsSlug, pKey, identifier } = useParams();
  const navigate = useNavigate();

  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const { data: projects = [] } = useProjects(currentWs?.id ?? "");
  const currentProject = projects.find((p) => p.key === pKey);

  // Resolve identifier → task_id via the /resolve endpoint (single roundtrip,
  // not dependent on the task list being loaded), then fetch canonical record.
  const { data: resolved, isLoading: resolving, isError: resolveError } =
    useResolveIdentifier(identifier ?? "");
  const {
    data: issue,
    isLoading: issueLoading,
    isError: issueError,
  } = useTask(resolved?.task_id ?? "");

  const updateMutation = useUpdateTask(issue?.id ?? "");
  const deleteMutation = useDeleteTask();

  const { data: sprints = [] } = useSprints(currentProject?.id ?? "");

  const [titleDraft, setTitleDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [descEditing, setDescEditing] = useState(false);

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

  const { data: activity = [] } = useTaskActivity(issue?.id ?? "");

  const { data: members = [] } = useMembers(currentWs?.id ?? "");

  const { data: workspaceLabels = [] } = useLabels(currentWs?.id ?? "");
  const { data: attachedLabels = [] } = useTaskLabels(issue?.id ?? "");
  const attachLabelMutation = useAttachLabel(issue?.id ?? "");
  const detachLabelMutation = useDetachLabel(issue?.id ?? "");

  const attachedIds = new Set(attachedLabels.map((l) => l.id));

  async function toggleLabel(labelId: string) {
    try {
      if (attachedIds.has(labelId)) {
        await detachLabelMutation.mutateAsync(labelId);
      } else {
        await attachLabelMutation.mutateAsync(labelId);
      }
    } catch (err) {
      toast.error("Failed to toggle label");
    }
  }

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

  if (resolveError || issueError) {
    return (
      <div className="space-y-2">
        <p className="text-slate-700">
          Task {identifier} could not be loaded
          {resolveError ? " (not found)" : ""}
          {issueError ? " (access denied)" : ""}.
        </p>
        <button
          type="button"
          onClick={() => navigate(`/w/${wsSlug}/p/${pKey}/board`)}
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to {pKey}
        </button>
      </div>
    );
  }
  if (resolving || issueLoading || !issue) {
    return (
      <p className="text-muted-foreground">
        {resolving ? "Looking up " : "Loading "}
        {identifier}…
      </p>
    );
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
      toast.success("Task deleted");
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
          {descEditing ? (
            <textarea
              autoFocus
              className="w-full rounded border border-slate-200 bg-white p-2 text-sm"
              rows={8}
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              onBlur={() => {
                setDescEditing(false);
                if (descDraft !== issue.description) {
                  save("description", descDraft);
                }
              }}
            />
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={() => setDescEditing(true)}
              onKeyDown={(e) => e.key === "Enter" && setDescEditing(true)}
              className="min-h-[8rem] w-full cursor-text rounded border border-slate-200 bg-white p-2"
            >
              {descDraft.trim() ? (
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {descDraft}
                  </ReactMarkdown>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">
                  Click to add a description…
                </span>
              )}
            </div>
          )}
        </div>
        <Button
          variant="outline"
          onClick={onDelete}
          disabled={deleteMutation.isPending}
          className="text-red-600 hover:bg-red-50"
        >
          Delete task
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
              <div className="prose prose-sm max-w-none mt-1">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{c.body}</ReactMarkdown>
              </div>
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

        {activity.length > 0 && (
          <section className="space-y-2 pt-6 border-t border-slate-200">
            <h2 className="text-sm font-semibold uppercase text-muted-foreground">
              Activity
            </h2>
            <ul className="space-y-1">
              {activity.map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-4 text-xs">
                  <span className="text-slate-600">{formatActivity(a)}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="space-y-4 border-l border-slate-200 pl-6">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Status
          </p>
          <select
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
            value={issue.status}
            onChange={(e) => save("status", e.target.value as TaskStatus)}
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
            onChange={(e) => save("priority", e.target.value as TaskPriority)}
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
            Labels
          </p>
          <div className="flex flex-wrap gap-1">
            {attachedLabels.length === 0 && (
              <span className="text-xs text-muted-foreground">—</span>
            )}
            {attachedLabels.map((l) => (
              <span
                key={l.id}
                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs"
                style={{ backgroundColor: `${l.color}20`, color: l.color }}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: l.color }}
                />
                {l.name}
              </span>
            ))}
          </div>
          {workspaceLabels.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-slate-700">
                Edit labels
              </summary>
              <div className="mt-2 space-y-1">
                {workspaceLabels.map((l) => (
                  <label
                    key={l.id}
                    className="flex items-center gap-2 text-xs cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5"
                  >
                    <input
                      type="checkbox"
                      checked={attachedIds.has(l.id)}
                      onChange={() => toggleLabel(l.id)}
                    />
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: l.color }}
                    />
                    {l.name}
                  </label>
                ))}
              </div>
            </details>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Assignee
          </p>
          <select
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
            value={issue.assignee_id ?? ""}
            onChange={(e) =>
              save("assignee_id", e.target.value === "" ? null : e.target.value)
            }
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.email ?? m.user_id}
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
