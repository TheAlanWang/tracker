// Task detail — the big read/edit-a-task page.
//
// Two entry points share this code via the exported `TaskDetailContent`:
//   1. `/w/:wsSlug/p/:pKey/tasks/:identifier` — full page (default export
//      below resolves the identifier to a task id and renders Content).
//   2. <TaskDetailModal> — the modal used from Dashboard / List / Board.
//
// Edit model: starts in view mode. "Edit" enters edit mode, which mounts
// inline controls (Select / input / textarea) and a draft state per field;
// "Save" commits via useUpdateTask, "Discard" reverts. The Watch / Edit
// (or Watch / Discard) button pair lives on the top-right of the title row.
//
// Side rails:
//   - Right aside: Status, Priority, Due date, Sprint, Assignee, Created,
//     Updated. Inline-edit controls swap in when isEditing is true.
//   - Below the description: Comments + Activity. Activity uses styled
//     status/priority pills for value changes (renderActivityValue), with
//     field-specific "default" labels ("Unassigned", "No due date", etc.)
//     so reading "from X to Y" history is meaningful.

import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Activity as ActivityIcon, AlignLeft, MessageSquare, Trash2 } from "lucide-react";

import { Avatar } from "@/components/Avatar";
import {
  DependenciesSection,
  type PendingDepAdd,
} from "@/components/DependenciesSection";
import {
  useCreateDependency,
  useDeleteDependency,
  useDependencies,
} from "@/features/dependencies/api";
import { useTaskLabels } from "@/features/labels/api";
import { LabelsEditor } from "@/components/LabelsEditor";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { CommentBody } from "@/components/CommentBody";
import { MentionTextarea } from "@/components/MentionTextarea";
import { ChecklistSection } from "@/components/ChecklistSection";
import { Skeleton } from "@/components/ui/skeleton";
import { GoalPicker } from "@/components/GoalPicker";
import { useChecklist } from "@/features/checklist/api";
import { useGoals } from "@/features/goals/api";
import { isSprintsEnabled, useWorkspaces } from "@/features/workspaces/api";
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
import {
  useTaskWatchers,
  useWatchTask,
  useUnwatchTask,
} from "@/features/watchers/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { PriorityPill, StatusPill } from "@/components/StatusPill";
import {
  PRIORITY,
  PRIORITY_ORDER,
  STATUS,
  STATUS_ORDER,
} from "@/features/tasks/labels";

const STATUSES: { value: TaskStatus; label: string }[] = STATUS_ORDER.map(
  (value) => ({ value, label: STATUS[value].label }),
);

// Eye icon — filled when watching, outlined when not. Inline so we avoid a
// new dependency just for one shape.
// Three-dot overflow menu for destructive / secondary task actions. Kept
// inline here because it's only used in one place and the surface area is
// tiny — a separate file would obscure the wiring more than it helps. The
// menu is always available (edit-mode-independent) because Delete is a
// task-level action, not a save-flow action.
function TaskActionsMenu({
  onDelete,
  deleteDisabled,
}: {
  onDelete: () => void;
  deleteDisabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen((v) => !v)}
        aria-label="More actions"
        className="px-2"
      >
        <span className="leading-none text-base">⋯</span>
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg py-1 text-sm">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            disabled={deleteDisabled}
            className="w-full text-left px-3 py-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:hover:bg-transparent"
          >
            Delete task
          </button>
        </div>
      )}
    </div>
  );
}

function WatchIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
      aria-hidden
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" fill={filled ? "white" : "none"} />
    </svg>
  );
}

const PRIORITIES: { value: TaskPriority; label: string }[] = PRIORITY_ORDER.map(
  (value) => ({ value, label: PRIORITY[value].label }),
);

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

type ActivityContext = {
  resolveActor: (id: string | null) => string;
  // Renders an activity-log raw value as JSX. Status / priority become
  // colored pills (matching how they look elsewhere in the app); foreign-key
  // fields resolve to names; dates format locally.
  renderValue: (field: string, value: unknown) => React.ReactNode;
};

// Inline arrow used between from→to values in activity rows. Crisp SVG
// reads better than the unicode "→" character at body-text size.
function FromToArrow() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block w-3.5 h-3.5 mx-1 text-slate-400 dark:text-slate-500 align-[-2px]"
      aria-hidden
    >
      <path d="M4 10h12M12 6l4 4-4 4" />
    </svg>
  );
}

function renderActivityLine(
  a: Activity,
  ctx: ActivityContext,
): React.ReactNode {
  const actor = ctx.resolveActor(a.actor_id);
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
            <span className="inline-flex items-center flex-wrap gap-x-1">
              changed {label}
              {ctx.renderValue(f, c.from)}
              <FromToArrow />
              {ctx.renderValue(f, c.to)}
            </span>
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
      <span className="font-medium text-slate-900 dark:text-slate-100">{actor}</span> {body}{" "}
      <span className="text-slate-400 dark:text-slate-500">· {time}</span>
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
// Skeleton matching TaskDetail's two-column layout — title row, content
// block, and an aside with stacked metadata. Sized to keep the page
// height stable while data loads.
function TaskDetailSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-8 max-w-6xl">
      <div className="col-span-2 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-9 w-3/4" />
          </div>
          <div className="flex gap-2 shrink-0">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-20" />
          </div>
        </div>
        <Skeleton className="h-4 w-24 mt-4" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-4 w-28 mt-6" />
        <Skeleton className="h-24 w-full" />
      </div>
      <aside className="space-y-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-full" />
          </div>
        ))}
      </aside>
    </div>
  );
}

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
  // Dependency mutations are fired by onSave so we can batch them with
  // the main task update — keeps the "draft → Save" flow consistent
  // with every other editable field in the aside.
  const createDepMutation = useCreateDependency();
  const deleteDepMutation = useDeleteDependency();

  const { data: sprints = [] } = useSprints(task?.project_id ?? "");
  const { data: members = [] } = useMembers(task?.workspace_id ?? "");
  const { data: goals = [] } = useGoals(task?.workspace_id ?? "");
  // Goals is opt-in per workspace. When the owner hasn't enabled it,
  // suppress the Goal picker in the aside entirely — otherwise users
  // would see (and could pick) goals that have no surface elsewhere.
  const { data: workspaces = [] } = useWorkspaces();
  const taskWorkspace = workspaces.find((w) => w.id === task?.workspace_id);
  const goalsEnabled = !!taskWorkspace?.features?.goals;
  // Sprints defaults ON (undefined → true) — only explicit false hides the
  // inline sprint picker in the right rail. The sprint_id on the task is
  // preserved either way; we just stop showing the editor.
  const sprintsEnabled = isSprintsEnabled(taskWorkspace);
  const { data: checklistItems = [] } = useChecklist(task?.id ?? "");
  const uncheckedCount = checklistItems.filter((i) => !i.done).length;
  // Bridge state for the empty → first-item flow: clicking "+ Add
  // checklist" mounts ChecklistSection in forceShow mode. Once the
  // user types the first item, `checklistItems.length > 0` makes the
  // section visible regardless, so this flag is one-shot per session.
  const [showEmptyChecklist, setShowEmptyChecklist] = useState(false);
  const { data: deps } = useDependencies(task?.id ?? "");
  // For the empty-section hiding rule — TaskDetail needs to know whether
  // Labels has any content so it can collapse the row in view mode.
  const { data: taskLabels = [] } = useTaskLabels(task?.id ?? "");
  // Open blockers right now: any blocker task not yet done/cancelled.
  // Used to warn the user when they try to push this task forward
  // (Save → in_progress / in_review) while dependencies are still open.
  const openBlockers =
    deps?.blockers.filter(
      (l) => l.task.status !== "done" && l.task.status !== "cancelled",
    ) ?? [];


  // Watchers: the current user can subscribe to a task's lifecycle even when
  // they're not the assignee. `isWatching` drives the Watch / Watching toggle.
  const { data: me } = useCurrentUser();
  const { data: watchers = [] } = useTaskWatchers(task?.id);
  const watchMutation = useWatchTask(task?.id);
  const unwatchMutation = useUnwatchTask(task?.id);
  const isWatching = !!me && watchers.some((w) => w.user_id === me.id);
  const watchBusy = watchMutation.isPending || unwatchMutation.isPending;
  function toggleWatch() {
    if (isWatching) unwatchMutation.mutate();
    else watchMutation.mutate();
  }

  // View mode by default — tasks are mostly read. Click "Edit" to enter
  // edit mode; Save/Discard returns to view.
  const [isEditing, setIsEditing] = useState(false);

  // --- Draft state: changes pending until user clicks Save ---
  const [titleDraft, setTitleDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [statusDraft, setStatusDraft] = useState<TaskStatus>("backlog");
  const [priorityDraft, setPriorityDraft] =
    useState<TaskPriority>("no_priority");
  const [dueDateDraft, setDueDateDraft] = useState("");
  const [sprintDraft, setSprintDraft] = useState<string | null>(null);
  const [assigneeDraft, setAssigneeDraft] = useState<string | null>(null);
  const [goalDraft, setGoalDraft] = useState<string | null>(null);
  // Dependency draft: pending adds (not yet persisted) and ids of
  // backend dependencies that the user has marked for removal. Both
  // arrays/sets reset on entering edit or on Discard, and get drained
  // by onSave (one create / delete mutation per entry).
  const [pendingDepAdds, setPendingDepAdds] = useState<PendingDepAdd[]>([]);
  const [pendingDepRemoveIds, setPendingDepRemoveIds] = useState<Set<string>>(
    new Set(),
  );

  // Hydrate draft fields from the loaded task. useQuery returns a stable
  // reference until the task id changes, so this effect fires once per
  // task-open, not on every render — the "cascading renders" failure mode
  // the eslint rule is paranoid about doesn't apply here. Splitting this
  // 600-line component into outer-loader + inner-drafts would pipe 8+ hooks
  // through props and obscure the page logic, which is why we suppress
  // locally instead.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (task) {
      setTitleDraft(task.title);
      setDescDraft(task.description);
      setStatusDraft(task.status);
      setPriorityDraft(task.priority);
      setDueDateDraft(task.due_date ?? "");
      setSprintDraft(task.sprint_id);
      setAssigneeDraft(task.assignee_id);
      setGoalDraft(task.goal_id);
      setPendingDepAdds([]);
      setPendingDepRemoveIds(new Set());
      setIsEditing(false); // reset to view mode when opening a different task
    }
  }, [task]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const dirty =
    !!task &&
    (titleDraft !== task.title ||
      descDraft !== task.description ||
      statusDraft !== task.status ||
      priorityDraft !== task.priority ||
      (dueDateDraft || null) !== task.due_date ||
      sprintDraft !== task.sprint_id ||
      assigneeDraft !== task.assignee_id ||
      goalDraft !== task.goal_id ||
      pendingDepAdds.length > 0 ||
      pendingDepRemoveIds.size > 0);

  const { data: comments = [] } = useComments(task?.id ?? "");
  const createCommentMutation = useCreateComment(task?.id ?? "");
  const deleteCommentMutation = useDeleteComment(task?.id ?? "");
  const [commentDraft, setCommentDraft] = useState("");

  const { data: activity = [] } = useTaskActivity(task?.id ?? "");

  // Prefer display_name → email → first 8 chars of user_id (fallback so a
  // missing profile never shows a full UUID).
  const resolveActor = (id: string | null) => {
    if (!id) return "Someone";
    const m = members.find((mb) => mb.user_id === id);
    return m?.display_name?.trim() || m?.email || `${id.slice(0, 8)}…`;
  };

  // Renders an activity-log value as JSX. Status / priority pills reuse
  // the canonical STATUS / PRIORITY configs so the colors line up with how
  // those values look on the board / list / dashboard. Foreign-key fields
  // resolve to names; dates format locally; everything else falls through.
  const renderActivityValue = (
    field: string,
    value: unknown,
  ): React.ReactNode => {
    const isEmpty = value == null || value === "";
    const s = isEmpty ? "" : String(value);
    // Field-specific "default" / empty label — much more useful than a
    // generic em-dash. Tells the reader exactly what state the task was in.
    const empty = (text: string) => (
      <span className="italic text-slate-500 dark:text-slate-400">{text}</span>
    );

    switch (field) {
      case "status": {
        if (isEmpty) return empty("No status");
        return STATUS[s as TaskStatus] ? (
          <StatusPill status={s as TaskStatus} size="sm" />
        ) : (
          <span className="italic text-slate-500 dark:text-slate-400">{s.replace(/_/g, " ")}</span>
        );
      }
      case "priority": {
        if (isEmpty) return empty("No priority");
        return PRIORITY[s as TaskPriority] ? (
          <PriorityPill priority={s as TaskPriority} size="sm" />
        ) : (
          <span className="italic text-slate-500 dark:text-slate-400">{s.replace(/_/g, " ")}</span>
        );
      }
      case "assignee_id":
        if (isEmpty) return empty("Unassigned");
        return (
          <span className="font-medium text-slate-900 dark:text-slate-100">{resolveActor(s)}</span>
        );
      case "reporter_id":
        if (isEmpty) return empty("No reporter");
        return (
          <span className="font-medium text-slate-900 dark:text-slate-100">{resolveActor(s)}</span>
        );
      case "sprint_id":
        if (isEmpty) return empty("Backlog (no sprint)");
        return (
          <span className="font-medium text-slate-900 dark:text-slate-100">
            {sprints.find((sp) => sp.id === s)?.name ?? "—"}
          </span>
        );
      case "due_date":
        if (isEmpty) return empty("No due date");
        return (
          <span className="font-medium text-slate-900 dark:text-slate-100">
            {new Date(s).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
        );
      default:
        if (isEmpty) return empty("—");
        return <span className="font-medium text-slate-900 dark:text-slate-100">{s}</span>;
    }
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
    if (goalDraft !== task.goal_id) payload.goal_id = goalDraft;
    try {
      // Main task fields go first. If this fails the whole save aborts,
      // leaving the dependency drafts intact so the user can fix and retry.
      if (Object.keys(payload).length > 0) {
        await updateMutation.mutateAsync(payload as never);
      }
      // Commit dependency drafts after the main update — creates first
      // (the backend may 409 on a cycle and the user needs to see that
      // specific entry rejected), then removes. Both run serially so
      // we can surface a precise error if one fails mid-batch.
      for (const add of pendingDepAdds) {
        const depPayload =
          add.direction === "blocker"
            ? { blocker_task_id: add.task.id, blocked_task_id: task.id }
            : { blocker_task_id: task.id, blocked_task_id: add.task.id };
        await createDepMutation.mutateAsync(depPayload);
      }
      for (const depId of pendingDepRemoveIds) {
        await deleteDepMutation.mutateAsync(depId);
      }
      setPendingDepAdds([]);
      setPendingDepRemoveIds(new Set());
      toast.success("Saved");
      setIsEditing(false);
      // Soft reminder: if the user just marked this task as done but the
      // checklist still has unchecked items, surface that as a non-blocking
      // toast. Checklist state and task status are decoupled by design —
      // this is just a "did you forget?" nudge, never a gate.
      if (
        task &&
        statusDraft === "done" &&
        task.status !== "done" &&
        uncheckedCount > 0
      ) {
        toast.message(
          `Marked done with ${uncheckedCount} unchecked checklist item${
            uncheckedCount === 1 ? "" : "s"
          }`,
        );
      }
      // Soft warning: user just moved a still-blocked task into an
      // active state. Doesn't block the move — by design, the user can
      // override dependencies — but flags that the blocker is still
      // open so they're aware.
      const wasMovingForward =
        statusDraft !== task.status &&
        (statusDraft === "in_progress" || statusDraft === "in_review");
      if (wasMovingForward && openBlockers.length > 0) {
        const blockerNames = openBlockers
          .slice(0, 2)
          .map((l) => l.task.identifier)
          .join(", ");
        const suffix =
          openBlockers.length > 2 ? ` +${openBlockers.length - 2} more` : "";
        toast.message(
          `Still blocked by ${blockerNames}${suffix} — moved anyway.`,
        );
      }
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
    setGoalDraft(task.goal_id);
    setPendingDepAdds([]);
    setPendingDepRemoveIds(new Set());
    setIsEditing(false);
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
      <p className="text-slate-700 dark:text-slate-300">
        This task could not be loaded (access denied).
      </p>
    );
  }
  if (taskLoading || !task) {
    return <TaskDetailSkeleton />;
  }

  return (
    <div className="grid grid-cols-3 gap-8">
      <div className="col-span-2 space-y-4">
        {/* Title block — two rows now (was one):
            Row 1: identifier eyebrow on the left, action button cluster
                   on the right. Identifier is short, so the cluster sits
                   with breathing room without crowding anything.
            Row 2: title (input/h1) gets the FULL container width. No
                   button cluster competing for horizontal space, so
                   long titles read normally instead of getting squeezed
                   under the buttons. */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4 min-h-[36px]">
            {task ? (
              <p className="font-mono text-xs text-slate-500 dark:text-slate-400 tracking-wide select-all">
                {task.identifier}
              </p>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={toggleWatch}
                disabled={watchBusy || !task}
                title={
                  isWatching
                    ? "Stop receiving notifications for this task"
                    : "Get notified about comments and status changes"
                }
                className={
                  isWatching
                    ? "gap-1.5 bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                    : "gap-1.5"
                }
              >
                <WatchIcon filled={isWatching} />
                <span>{isWatching ? "Watching" : "Watch"}</span>
                {watchers.length > 0 && (
                  <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {watchers.length}
                  </span>
                )}
              </Button>
              {/* Edit / Save+Discard pair — commits the WHOLE task, not
                  just the description. Save sits left of Discard so the
                  eye lands on the primary action first. */}
              {isEditing ? (
                <>
                  <Button
                    type="button"
                    onClick={onSave}
                    disabled={!dirty || updateMutation.isPending}
                  >
                    {updateMutation.isPending ? "Saving…" : "Save"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onDiscard}
                    disabled={updateMutation.isPending}
                  >
                    Discard
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                >
                  Edit
                </Button>
              )}
              <TaskActionsMenu
                onDelete={onDelete}
                deleteDisabled={deleteMutation.isPending}
              />
            </div>
          </div>
          {isEditing ? (
            <input
              className="w-full bg-transparent text-2xl font-normal tracking-tight text-slate-800 dark:text-slate-100 outline-none hover:bg-slate-100/50 dark:hover:bg-slate-800/40 focus:bg-slate-100/80 dark:focus:bg-slate-800/60 rounded px-1.5 py-0.5 transition-colors"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              placeholder="Title"
            />
          ) : (
            <h1 className="text-2xl font-normal tracking-tight text-slate-800 dark:text-slate-100 px-1.5 py-0.5 break-words">
              {titleDraft}
            </h1>
          )}
        </div>

        {/* Description as a collapsible <details>, mirroring Checklist /
            Comments / Activity. Default open so users see the body
            content immediately on open; can fold away when reviewing
            the side rail / activity. Less top padding than the others
            because Description sits right under the title — no need
            for a full cross-section gap there. */}
        <details open className="pt-1 group">
          <summary className="cursor-pointer list-none flex items-center gap-1.5 text-sm font-normal uppercase tracking-wide text-muted-foreground hover:text-slate-700 dark:hover:text-slate-300 group-open:pb-2 group-open:border-b border-slate-200 dark:border-slate-800">
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
            <AlignLeft className="w-3.5 h-3.5" aria-hidden />
            <span>Description</span>
          </summary>
          <div className="mt-3">
            {isEditing ? (
              <textarea
                className="w-full rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 text-sm"
                rows={6}
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                placeholder="Add a description…"
              />
            ) : descDraft.trim() ? (
              // Tweaks vs. raw @tailwindcss/typography: fenced <pre>
              // blocks get a light slate bg + dark text (the default
              // near-black dominates a mostly-prose description); inline
              // <code> becomes a subtle pill with the plugin's auto
              // backtick pseudo-elements suppressed.
              <div className="prose prose-sm max-w-none text-slate-700 dark:text-slate-300 prose-pre:bg-slate-100 dark:prose-pre:bg-slate-800/60 prose-pre:text-slate-800 dark:prose-pre:text-slate-200 prose-pre:rounded-md prose-pre:p-3 prose-pre:text-[13px] prose-code:bg-slate-100 dark:prose-code:bg-slate-800/60 prose-code:text-slate-800 dark:prose-code:text-slate-200 prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-normal prose-code:before:hidden prose-code:after:hidden">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                >
                  {descDraft}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm italic text-slate-400 dark:text-slate-500">
                No description.
              </p>
            )}
          </div>
        </details>

        {/* Checklist items persist immediately via their own mutations,
            so we don't gate edits behind the task-level Edit / Save flow.
            The section hides itself when empty; the small entry-point
            button below mounts it in "ready to add first item" mode. */}
        {task && (
          <ChecklistSection
            taskId={task.id}
            // forceShow is gated on isEditing too — if the user clicks
            // "+ Add checklist" then leaves edit mode without typing,
            // the empty section folds back so we're not stuck rendering
            // an empty AddRow forever.
            forceShow={isEditing && showEmptyChecklist}
          />
        )}
        {task &&
          isEditing &&
          checklistItems.length === 0 &&
          !showEmptyChecklist && (
            <button
              type="button"
              onClick={() => setShowEmptyChecklist(true)}
              className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              + Add checklist
            </button>
          )}

        {/* Comments uses the same collapsible <details> pattern as
            Activity below — default open so the conversation is visible
            on first paint, but users can fold it away when the side rail
            is what they're reading. */}
        <details open className="pt-6 group">
          <summary className="cursor-pointer list-none flex items-center gap-1.5 text-sm font-normal uppercase tracking-wide text-muted-foreground hover:text-slate-700 dark:hover:text-slate-300 group-open:pb-2 group-open:border-b border-slate-200 dark:border-slate-800">
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
            <MessageSquare className="w-3.5 h-3.5" aria-hidden />
            <span>Comments</span>
            {comments.length > 0 && (
              <span className="text-slate-400 dark:text-slate-500 font-medium normal-case tracking-normal">
                ({comments.length})
              </span>
            )}
          </summary>
          <div className="mt-3 space-y-3">
          {comments.length === 0 ? (
            <p className="text-sm italic text-slate-400 dark:text-slate-500">
              No comments yet.
            </p>
          ) : (
            comments.map((c) => {
              // Look the author up in members to render avatar + real name;
              // falls back to resolveActor's text-only output if not found
              // (e.g. departed members, system actors).
              const author = members.find((m) => m.user_id === c.author_id);
              const authorName = resolveActor(c.author_id);
              const fullTime = new Date(c.created_at).toLocaleString();
              const isMine = !!me && c.author_id === me.id;
              return (
                <div
                  key={c.id}
                  className="group rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
                >
                  {/* Body first — that's what people scan; author/time
                      below as a subordinate footer. */}
                  <CommentBody body={c.body} members={members} />
                  <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center gap-2">
                    <Avatar
                      displayName={author?.display_name ?? null}
                      email={author?.email ?? null}
                      avatarUrl={author?.avatar_url ?? null}
                      color={author?.avatar_color ?? null}
                      size={20}
                      className="shrink-0"
                    />
                    <div className="flex-1 min-w-0 text-xs text-slate-500 dark:text-slate-400 truncate">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {authorName}
                      </span>
                      <span className="mx-1.5 text-slate-300 dark:text-slate-600">
                        ·
                      </span>
                      <span title={fullTime}>
                        {formatRelativeTime(c.created_at)}
                      </span>
                    </div>
                    {isMine && (
                      <button
                        type="button"
                        onClick={() => onDeleteComment(c.id)}
                        title="Delete comment"
                        aria-label="Delete comment"
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-500 transition-opacity rounded p-1 -mr-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <form onSubmit={onPostComment} className="space-y-2">
            <MentionTextarea
              value={commentDraft}
              onChange={setCommentDraft}
              members={members}
              placeholder="Write a comment… use @ to mention a teammate"
              rows={3}
              maxLength={10000}
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-sm"
            />
            {/* Buttons only appear once the user has typed something —
                resting state is just the textarea + placeholder, no
                idle "Post comment" sitting around disabled. The
                placeholder copy is enough to tell people this is a
                type-and-submit affordance. */}
            {commentDraft.trim() && (
              <div className="flex items-center gap-2">
                <Button
                  type="submit"
                  disabled={createCommentMutation.isPending}
                >
                  {createCommentMutation.isPending ? "Posting…" : "Post comment"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCommentDraft("")}
                  disabled={createCommentMutation.isPending}
                >
                  Cancel
                </Button>
              </div>
            )}
          </form>
          </div>
        </details>

        <details className="pt-6 group">
          <summary className="cursor-pointer list-none flex items-center gap-1.5 text-sm font-normal uppercase tracking-wide text-muted-foreground hover:text-slate-700 dark:hover:text-slate-300 group-open:pb-2 group-open:border-b border-slate-200 dark:border-slate-800">
            {/* Disclosure chevron stays — rotates to indicate open/closed.
                Activity icon mirrors the per-section icon pattern used by
                Description / Checklist / Comments. */}
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
            <ActivityIcon className="w-3.5 h-3.5" aria-hidden />
            <span>Activity</span>
            {activity.length > 0 && (
              <span className="text-slate-400 dark:text-slate-500 font-medium normal-case tracking-normal">
                ({activity.length})
              </span>
            )}
          </summary>
          <div className="mt-3">
            {activity.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">No activity yet.</p>
            ) : (
              <ol className="space-y-1.5">
                {[...activity].reverse().map((a) => (
                  <li
                    key={a.id}
                    className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed"
                  >
                    {renderActivityLine(a, {
                      resolveActor,
                      renderValue: renderActivityValue,
                    })}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </details>
      </div>

      <aside className="space-y-4 border-l border-slate-200 dark:border-slate-800 pl-6 self-start sticky top-0 pb-4">
        <div className="space-y-1">
          <p className="text-sm font-normal uppercase tracking-wide text-muted-foreground">
            Status
          </p>
          {isEditing ? (
            <Select
              value={statusDraft}
              onChange={(v) => setStatusDraft(v as TaskStatus)}
              options={STATUSES}
              renderOption={(o) => <StatusPill status={o.value as TaskStatus} />}
            />
          ) : (
            <StatusPill status={statusDraft} />
          )}
        </div>

        {/* Priority — hide entire block in view mode when "No priority". */}
        {(isEditing || priorityDraft !== "no_priority") && (
          <div className="space-y-1">
            <p className="text-sm font-normal uppercase tracking-wide text-muted-foreground">
              Priority
            </p>
            {isEditing ? (
              <Select
                value={priorityDraft}
                onChange={(v) => setPriorityDraft(v as TaskPriority)}
                options={PRIORITIES}
                renderOption={(o) => <PriorityPill priority={o.value as TaskPriority} />}
              />
            ) : (
              <PriorityPill priority={priorityDraft} />
            )}
          </div>
        )}

        {/* Due date — hide in view mode when unset. */}
        {(isEditing || dueDateDraft) && (
          <div className="space-y-1">
            <p className="text-sm font-normal uppercase tracking-wide text-muted-foreground">
              Due date
            </p>
            {isEditing ? (
              <input
                type="date"
                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
                value={dueDateDraft}
                onChange={(e) => setDueDateDraft(e.target.value)}
              />
            ) : (
              <p className="text-sm text-slate-700 dark:text-slate-300">
                {new Date(dueDateDraft).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            )}
          </div>
        )}

        {/* Sprint — hide in view mode when the task is in backlog (no sprint).
            Also hide entirely when the workspace has Sprints disabled. The
            sprint_id on the task is still preserved on save (sprintDraft is
            wired into the dirty-check / payload regardless). */}
        {sprintsEnabled && (isEditing || sprintDraft) && (
          <div className="space-y-1">
            <p className="text-sm font-normal uppercase tracking-wide text-muted-foreground">
              Sprint
            </p>
            {isEditing ? (
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
            ) : (
              <p className="text-sm text-slate-700 dark:text-slate-300">
                {sprints.find((s) => s.id === sprintDraft)?.name ?? "Unknown"}
              </p>
            )}
          </div>
        )}

        {/* Hide entire Goal block in view mode when no goal is linked. */}
        {goalsEnabled && (isEditing || goalDraft) && (
          <div className="space-y-1">
            <p className="text-sm font-normal uppercase tracking-wide text-muted-foreground">
              Goal
            </p>
            {isEditing ? (
              <GoalPicker
                value={goalDraft}
                onChange={setGoalDraft}
                workspaceId={task?.workspace_id ?? ""}
              />
            ) : (
              <p className="text-sm text-slate-700 dark:text-slate-300">
                {goals.find((g) => g.id === goalDraft)?.title ?? "Unknown"}
              </p>
            )}
          </div>
        )}

        {/* Assignee — hide in view mode when unassigned. */}
        {(isEditing || assigneeDraft) && (
          <div className="space-y-1">
            <p className="text-sm font-normal uppercase tracking-wide text-muted-foreground">
              Assignee
            </p>
            {isEditing ? (
              <Select
                value={assigneeDraft ?? ""}
                onChange={(v) => setAssigneeDraft(v === "" ? null : v)}
                options={[
                  { value: "", label: "Unassigned" },
                  ...members.map((m) => ({
                    value: m.user_id,
                    label: m.display_name || m.email || m.user_id,
                  })),
                ]}
                // Render name + email so identically-named members
                // ("Ben" + "Ben") stay disambiguated. Email is muted +
                // smaller so it doesn't compete with the name visually.
                renderOption={(o) => {
                  if (o.value === "") {
                    return (
                      <span className="text-slate-500 dark:text-slate-400">
                        Unassigned
                      </span>
                    );
                  }
                  const m = members.find((mm) => mm.user_id === o.value);
                  const name = m?.display_name?.trim();
                  const email = m?.email;
                  if (name && email) {
                    return (
                      <span className="inline-flex items-baseline gap-1.5 min-w-0">
                        <span className="text-slate-900 dark:text-slate-100">
                          {name}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {email}
                        </span>
                      </span>
                    );
                  }
                  return <span>{name || email || o.label}</span>;
                }}
              />
            ) : assigneeDraft ? (
            (() => {
              const m = members.find((mm) => mm.user_id === assigneeDraft);
              const name = m?.display_name?.trim();
              const email = m?.email;
              return (
                <div
                  className="flex items-center gap-2 min-w-0"
                  title={
                    name && email ? `${name} · ${email}` : name || email || ""
                  }
                >
                  <Avatar
                    displayName={m?.display_name ?? null}
                    email={m?.email ?? null}
                    avatarUrl={m?.avatar_url ?? null}
                    color={m?.avatar_color ?? null}
                    size={22}
                    className="ring-0"
                  />
                  {/* Single line: name (bold) + email (muted) flow inline. */}
                  {/* truncation falls on email so the name stays readable. */}
                  <p className="text-sm text-slate-700 dark:text-slate-300 truncate min-w-0">
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {name || email || assigneeDraft}
                    </span>
                    {name && email && (
                      <span className="ml-1.5 text-xs text-slate-500 dark:text-slate-400">
                        {email}
                      </span>
                    )}
                  </p>
                </div>
              );
            })()
          ) : null}
          </div>
        )}

        {(isEditing || taskLabels.length > 0) && (
          <div className="space-y-1">
            <p className="text-sm font-normal uppercase tracking-wide text-muted-foreground">
              Labels
            </p>
            <LabelsEditor
              taskId={task.id}
              workspaceId={task.workspace_id}
              readOnly={!isEditing}
            />
          </div>
        )}

        <DependenciesSection
          taskId={task.id}
          workspaceId={task.workspace_id}
          readOnly={!isEditing}
          pendingAdds={pendingDepAdds}
          removedDepIds={pendingDepRemoveIds}
          onAdd={(direction, t) =>
            setPendingDepAdds((prev) => [...prev, { direction, task: t }])
          }
          onRemovePersisted={(depId) =>
            setPendingDepRemoveIds((prev) => {
              const next = new Set(prev);
              next.add(depId);
              return next;
            })
          }
          onCancelPendingAdd={(tid, direction) =>
            setPendingDepAdds((prev) =>
              prev.filter(
                (p) => !(p.task.id === tid && p.direction === direction),
              ),
            )
          }
        />

        <div className="space-y-1">
          <p className="text-sm font-normal uppercase tracking-wide text-muted-foreground">
            Created
          </p>
          {/* Matches Due Date's format ("May 12, 2026") with the time
              tucked alongside in muted slate so the value reads as one
              breath rather than a wall of digits. */}
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {new Date(task.created_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
            <span className="ml-1.5 text-xs text-slate-400 dark:text-slate-500">
              {new Date(task.created_at).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </p>
        </div>
      </aside>
    </div>
  );
}

type BackOrigin = { path: string; label: string };

export default function TaskDetail() {
  useDocumentTitle("Task");
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
        <p className="text-slate-700 dark:text-slate-300">
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
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
        >
          <ArrowLeftIcon />
          <span>Back to {backLabel}</span>
        </button>
      </div>
      <TaskDetailContent taskId={resolved.task_id} onDeleted={goBack} />
    </div>
  );
}
