import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { type Activity, useTaskActivity } from "@/features/activity/api";
import {
  useComments,
  useCreateComment,
  useDeleteComment,
} from "@/features/comments/api";
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

const FIELD_LABEL: Record<string, string> = {
  title: "title",
  description: "description",
  status: "status",
  priority: "priority",
  assignee_id: "assignee",
  sprint_id: "sprint",
  due_date: "due date",
};

function formatActivity(a: Activity): string {
  const actor = a.actor_id ? `${a.actor_id.slice(0, 8)}…` : "Someone";
  const p = a.payload;
  switch (a.action) {
    case "updated": {
      const fields = Object.keys(p);
      if (fields.length === 0) return `${actor} made an edit`;
      const names = fields.map((k) => FIELD_LABEL[k] ?? k).join(", ");
      return `${actor} updated ${names}`;
    }
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

function ArrowLeftIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="w-4 h-4"
    >
      <path
        fillRule="evenodd"
        d="M17 10a.75.75 0 0 1-.75.75H5.612l3.158 3.158a.75.75 0 0 1-1.06 1.06l-4.5-4.5a.75.75 0 0 1 0-1.06l4.5-4.5a.75.75 0 1 1 1.06 1.06L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function TaskDetail() {
  const { wsSlug, pKey, identifier } = useParams();
  const navigate = useNavigate();

  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const { data: projects = [] } = useProjects(currentWs?.id ?? "");
  const currentProject = projects.find((p) => p.key === pKey);

  const { data: resolved, isLoading: resolving, isError: resolveError } =
    useResolveIdentifier(identifier ?? "");
  const {
    data: task,
    isLoading: taskLoading,
    isError: taskError,
  } = useTask(resolved?.task_id ?? "");

  const updateMutation = useUpdateTask(task?.id ?? "");
  const deleteMutation = useDeleteTask();

  const { data: sprints = [] } = useSprints(currentProject?.id ?? "");
  const { data: members = [] } = useMembers(currentWs?.id ?? "");

  // --- Draft state: changes pending until user clicks Save ---
  const [titleDraft, setTitleDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [statusDraft, setStatusDraft] = useState<TaskStatus>("backlog");
  const [priorityDraft, setPriorityDraft] = useState<TaskPriority>("no_priority");
  const [dueDateDraft, setDueDateDraft] = useState("");
  const [sprintDraft, setSprintDraft] = useState<string | null>(null);
  const [assigneeDraft, setAssigneeDraft] = useState<string | null>(null);

  useEffect(() => {
    if (task) {
      setTitleDraft(task.title);
      setDescDraft(task.description);
      setStatusDraft(task.status);
      setPriorityDraft(task.priority);
      setDueDateDraft(task.due_date ?? "");
      setSprintDraft(task.sprint_id);
      setAssigneeDraft(task.assignee_id);
    }
  }, [task]);

  // Diff drafts vs server state
  const dirty = !!task && (
    titleDraft !== task.title ||
    descDraft !== task.description ||
    statusDraft !== task.status ||
    priorityDraft !== task.priority ||
    (dueDateDraft || null) !== task.due_date ||
    sprintDraft !== task.sprint_id ||
    assigneeDraft !== task.assignee_id
  );

  const { data: comments = [] } = useComments(task?.id ?? "");
  const createCommentMutation = useCreateComment(task?.id ?? "");
  const deleteCommentMutation = useDeleteComment(task?.id ?? "");
  const [commentDraft, setCommentDraft] = useState("");

  const { data: activity = [] } = useTaskActivity(task?.id ?? "");

  async function onSave() {
    if (!task || !dirty) return;
    const payload: Record<string, unknown> = {};
    if (titleDraft !== task.title) payload.title = titleDraft;
    if (descDraft !== task.description) payload.description = descDraft;
    if (statusDraft !== task.status) payload.status = statusDraft;
    if (priorityDraft !== task.priority) payload.priority = priorityDraft;
    const dd = dueDateDraft === "" ? null : dueDateDraft;
    if (dd !== task.due_date) payload.due_date = dd;
    if (sprintDraft !== task.sprint_id) payload.sprint_id = sprintDraft;
    if (assigneeDraft !== task.assignee_id) payload.assignee_id = assigneeDraft;
    try {
      await updateMutation.mutateAsync(payload as never);
      toast.success("Saved");
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to save";
      toast.error(detail);
    }
  }

  function onDiscard() {
    if (!task) return;
    setTitleDraft(task.title);
    setDescDraft(task.description);
    setStatusDraft(task.status);
    setPriorityDraft(task.priority);
    setDueDateDraft(task.due_date ?? "");
    setSprintDraft(task.sprint_id);
    setAssigneeDraft(task.assignee_id);
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

  async function onDelete() {
    if (!task) return;
    if (!confirm(`Delete this task?`)) return;
    try {
      await deleteMutation.mutateAsync(task.id);
      toast.success("Task deleted");
      navigate(`/w/${wsSlug}/p/${pKey}/board`);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to delete";
      toast.error(detail);
    }
  }

  if (resolveError || taskError) {
    return (
      <div className="space-y-2">
        <p className="text-slate-700">
          This task could not be loaded
          {resolveError ? " (not found)" : ""}
          {taskError ? " (access denied)" : ""}.
        </p>
        <button
          type="button"
          onClick={() => navigate(`/w/${wsSlug}/p/${pKey}/board`)}
          className="text-sm text-blue-600 hover:underline"
        >
          Back to board
        </button>
      </div>
    );
  }
  if (resolving || taskLoading || !task) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate(`/w/${wsSlug}/p/${pKey}/board`)}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
        >
          <ArrowLeftIcon />
          <span>Back to board</span>
        </button>
        {dirty && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-amber-600">Unsaved changes</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onDiscard}
              disabled={updateMutation.isPending}
            >
              Discard
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onSave}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-8">
        <div className="col-span-2 space-y-4">
          <input
            className="w-full bg-transparent text-2xl font-bold text-slate-900 outline-none focus:bg-slate-100 rounded px-1 py-0.5 -mx-1"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            placeholder="Title"
          />

          <div className="space-y-1">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Description
            </p>
            <textarea
              className="w-full rounded border border-slate-200 bg-white p-2 text-sm"
              rows={6}
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              placeholder="Add a description…"
            />
            {descDraft.trim() && (
              <details className="text-xs text-slate-500">
                <summary className="cursor-pointer hover:text-slate-700">
                  Preview rendered markdown
                </summary>
                <div className="prose prose-sm max-w-none mt-2 rounded border border-slate-200 bg-slate-50 p-3">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {descDraft}
                  </ReactMarkdown>
                </div>
              </details>
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

        <aside className="space-y-4 border-l border-slate-200 pl-6 self-start sticky top-0 pb-4">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Status
            </p>
            <Select
              value={statusDraft}
              onChange={(v) => setStatusDraft(v as TaskStatus)}
              options={STATUSES.map((s) => ({ value: s, label: s }))}
            />
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Priority
            </p>
            <Select
              value={priorityDraft}
              onChange={(v) => setPriorityDraft(v as TaskPriority)}
              options={PRIORITIES.map((p) => ({ value: p, label: p }))}
            />
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Due date
            </p>
            <input
              type="date"
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
              value={dueDateDraft}
              onChange={(e) => setDueDateDraft(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Sprint
            </p>
            <Select
              value={sprintDraft ?? ""}
              onChange={(v) => setSprintDraft(v === "" ? null : v)}
              options={[
                { value: "", label: "Backlog (no sprint)" },
                ...sprints
                  .filter((s) => s.status !== "completed")
                  .map((s) => ({
                    value: s.id,
                    label: s.status === "active" ? `${s.name} (active)` : s.name,
                  })),
              ]}
            />
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Assignee
            </p>
            <Select
              value={assigneeDraft ?? ""}
              onChange={(v) => setAssigneeDraft(v === "" ? null : v)}
              options={[
                { value: "", label: "Unassigned" },
                ...members.map((m) => ({
                  value: m.user_id,
                  label: m.email ?? m.user_id,
                })),
              ]}
            />
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Created
            </p>
            <p className="text-xs text-slate-500">
              {new Date(task.created_at).toLocaleString()}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
