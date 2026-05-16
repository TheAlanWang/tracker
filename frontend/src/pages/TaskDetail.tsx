import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
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
import { useSprints } from "@/features/sprints/api";
import { PRIORITY_LABELS, STATUS_LABELS } from "@/features/tasks/labels";

const STATUSES: { value: TaskStatus; label: string }[] = (
  Object.entries(STATUS_LABELS) as [TaskStatus, string][]
).map(([value, label]) => ({ value, label }));

const PRIORITIES: { value: TaskPriority; label: string }[] = (
  Object.entries(PRIORITY_LABELS) as [TaskPriority, string][]
).map(([value, label]) => ({ value, label }));

const FIELD_LABEL: Record<string, string> = {
  title: "title",
  description: "description",
  status: "status",
  priority: "priority",
  assignee_id: "assignee",
  sprint_id: "sprint",
  due_date: "due date",
};

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

function renderActivityLine(
  a: Activity,
  resolveActor: (id: string | null) => string,
): React.ReactNode {
  const actor = resolveActor(a.actor_id);
  const time = formatRelativeTime(a.created_at);
  const p = a.payload as Record<
    string,
    { from?: unknown; to?: unknown; updated?: boolean }
  >;

  let body: React.ReactNode;
  switch (a.action) {
    case "created":
      body = <>created this task</>;
      break;
    case "commented":
      body = <>posted a comment</>;
      break;
    case "updated": {
      const fields = Object.keys(p);
      if (fields.length === 0) {
        body = <>made an edit</>;
      } else if (fields.length === 1) {
        const f = fields[0];
        const label = FIELD_LABEL[f] ?? f;
        const c = p[f];
        if (c.updated) {
          body = <>edited the {label}</>;
        } else {
          body = (
            <>
              changed {label}{" "}
              <span className="text-slate-500">{String(c.from ?? "—")}</span>
              {" → "}
              <span className="text-slate-900">{String(c.to ?? "—")}</span>
            </>
          );
        }
      } else {
        const names = fields.map((k) => FIELD_LABEL[k] ?? k).join(", ");
        body = <>updated {names}</>;
      }
      break;
    }
    default:
      body = <>{a.action.replace(/_/g, " ")}</>;
  }

  return (
    <>
      <span className="font-medium text-slate-900">{actor}</span> {body}{" "}
      <span className="text-slate-400">· {time}</span>
    </>
  );
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

// Self-contained task editor: handles its own data fetching, draft state,
// save/discard/delete, comments, and activity. Used by both the full-page
// TaskDetail and the TaskDetailModal (board card click).
export function TaskDetailContent({
  taskId,
  onDeleted,
}: {
  taskId: string;
  onDeleted?: () => void;
}) {
  const {
    data: task,
    isLoading: taskLoading,
    isError: taskError,
  } = useTask(taskId);

  const updateMutation = useUpdateTask(task?.id ?? "");
  const deleteMutation = useDeleteTask();

  const { data: sprints = [] } = useSprints(task?.project_id ?? "");
  const { data: members = [] } = useMembers(task?.workspace_id ?? "");

  // --- Draft state: changes pending until user clicks Save ---
  const [titleDraft, setTitleDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [statusDraft, setStatusDraft] = useState<TaskStatus>("backlog");
  const [priorityDraft, setPriorityDraft] =
    useState<TaskPriority>("no_priority");
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

  const dirty =
    !!task &&
    (titleDraft !== task.title ||
      descDraft !== task.description ||
      statusDraft !== task.status ||
      priorityDraft !== task.priority ||
      (dueDateDraft || null) !== task.due_date ||
      sprintDraft !== task.sprint_id ||
      assigneeDraft !== task.assignee_id);

  const { data: comments = [] } = useComments(task?.id ?? "");
  const createCommentMutation = useCreateComment(task?.id ?? "");
  const deleteCommentMutation = useDeleteComment(task?.id ?? "");
  const [commentDraft, setCommentDraft] = useState("");

  const { data: activity = [] } = useTaskActivity(task?.id ?? "");

  const resolveActor = (id: string | null) => {
    if (!id) return "Someone";
    const m = members.find((mb) => mb.user_id === id);
    return m?.email ?? `${id.slice(0, 8)}…`;
  };

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
    } catch {
      toast.error("Failed to delete comment");
    }
  }

  async function onDelete() {
    if (!task) return;
    if (!confirm(`Delete this task?`)) return;
    try {
      await deleteMutation.mutateAsync(task.id);
      toast.success("Task deleted");
      onDeleted?.();
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? "Failed to delete";
      toast.error(detail);
    }
  }

  if (taskError) {
    return (
      <p className="text-slate-700">
        This task could not be loaded (access denied).
      </p>
    );
  }
  if (taskLoading || !task) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="grid grid-cols-3 gap-8">
      <div className="col-span-2 space-y-4">
        <input
          className="w-full bg-transparent text-2xl font-bold text-slate-900 outline-none focus:bg-slate-100 rounded px-1 py-0.5 -mx-1"
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          placeholder="Title"
        />

        <div className="space-y-2">
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
          </div>

          <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {dirty && (
              <span className="text-xs text-amber-600 mr-1">
                Unsaved changes
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={onDiscard}
              disabled={!dirty || updateMutation.isPending}
            >
              Discard
            </Button>
            <Button
              type="button"
              onClick={onSave}
              disabled={!dirty || updateMutation.isPending}
            >
              {updateMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
          <Button
            variant="outline"
            onClick={onDelete}
            disabled={deleteMutation.isPending}
            className="text-red-600 hover:bg-red-50"
          >
            Delete
          </Button>
          </div>
        </div>

        <section className="space-y-3 pt-6 border-t border-slate-200">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">
            Comments ({comments.length})
          </h2>
          {comments.map((c) => (
            <div
              key={c.id}
              className="rounded border border-slate-200 bg-white p-3"
            >
              <div className="flex justify-between items-baseline">
                <p className="text-xs text-muted-foreground">
                  {resolveActor(c.author_id)} ·{" "}
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
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {c.body}
                </ReactMarkdown>
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
            <Button
              type="submit"
              disabled={
                createCommentMutation.isPending || !commentDraft.trim()
              }
            >
              {createCommentMutation.isPending ? "Posting…" : "Post comment"}
            </Button>
          </form>
        </section>

        <details className="pt-6 border-t border-slate-200 group">
          <summary className="cursor-pointer list-none flex items-center gap-1.5 text-sm font-semibold uppercase text-muted-foreground hover:text-slate-700">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-3 h-3 transition-transform group-open:rotate-90"
            >
              <path
                fillRule="evenodd"
                d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
                clipRule="evenodd"
              />
            </svg>
            <span>Activity</span>
            {activity.length > 0 && (
              <span className="text-slate-400 font-medium normal-case tracking-normal">
                ({activity.length})
              </span>
            )}
          </summary>
          <div className="mt-3">
            {activity.length === 0 ? (
              <p className="text-xs text-slate-400">No activity yet.</p>
            ) : (
              <ol className="space-y-1.5">
                {[...activity].reverse().map((a) => (
                  <li
                    key={a.id}
                    className="text-xs text-slate-700 leading-relaxed"
                  >
                    {renderActivityLine(a, resolveActor)}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </details>
      </div>

      <aside className="space-y-4 border-l border-slate-200 pl-6 self-start sticky top-0 pb-4">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Status
          </p>
          <Select
            value={statusDraft}
            onChange={(v) => setStatusDraft(v as TaskStatus)}
            options={STATUSES}
            className="[&_button]:uppercase [&_button]:tracking-wide"
          />
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Priority
          </p>
          <Select
            value={priorityDraft}
            onChange={(v) => setPriorityDraft(v as TaskPriority)}
            options={PRIORITIES}
            className="[&_button]:uppercase [&_button]:tracking-wide"
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
                  label:
                    s.status === "active" ? `${s.name} (active)` : s.name,
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
  );
}

type BackOrigin = { path: string; label: string };

export default function TaskDetail() {
  const { wsSlug, pKey, identifier } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    data: resolved,
    isLoading: resolving,
    isError: resolveError,
  } = useResolveIdentifier(identifier ?? "");

  // Callers (List, My Tasks, Inbox, Sprint detail) pass where they came from.
  // Falls back to the project board when accessed directly (deep link, refresh).
  const from = (location.state as { from?: BackOrigin } | null)?.from;
  const backPath = from?.path ?? `/w/${wsSlug}/p/${pKey}/board`;
  const backLabel = from?.label ?? "Board";
  const goBack = () => navigate(backPath);

  if (resolveError) {
    return (
      <div className="space-y-2">
        <p className="text-slate-700">
          This task could not be loaded (not found).
        </p>
        <button
          type="button"
          onClick={goBack}
          className="text-sm text-blue-600 hover:underline"
        >
          Back to {backLabel}
        </button>
      </div>
    );
  }
  if (resolving || !resolved) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
        >
          <ArrowLeftIcon />
          <span>Back to {backLabel}</span>
        </button>
      </div>
      <TaskDetailContent taskId={resolved.task_id} onDeleted={goBack} />
    </div>
  );
}
