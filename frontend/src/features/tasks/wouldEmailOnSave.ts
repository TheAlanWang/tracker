// Mirror of backend/app/services/emails.py::should_email_assignment.
//
// Keep in sync — the backend is authoritative. When emails.py changes,
// update this file and the TaskDetail banner test cases in lockstep.

import type { NotifyAssigneeThreshold } from "@/features/projects/api";
import type { TaskPriority, TaskStatus } from "@/features/tasks/api";

const PRIORITY_RANK: Record<TaskPriority, number> = {
  no_priority: 0,
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
};

const THRESHOLD_MIN_RANK: Record<Exclude<NotifyAssigneeThreshold, "off">, number> = {
  any: 0,
  high: 3,
  urgent: 4,
};

function meetsThreshold(
  priority: TaskPriority | null,
  threshold: NotifyAssigneeThreshold,
): boolean {
  if (threshold === "off" || priority == null) return false;
  return PRIORITY_RANK[priority] >= THRESHOLD_MIN_RANK[threshold];
}

// Edit-mode predicate: the task already exists, so the backend's "create"
// branch (old_priority=None and old_assignee=None) does not apply.
export function wouldEmailOnSave(args: {
  oldPriority: TaskPriority;
  newPriority: TaskPriority;
  oldAssignee: string | null;
  newAssignee: string | null;
  newStatus: TaskStatus;
  actorId: string | null;
  threshold: NotifyAssigneeThreshold;
}): boolean {
  const {
    oldPriority,
    newPriority,
    oldAssignee,
    newAssignee,
    newStatus,
    actorId,
    threshold,
  } = args;

  if (threshold === "off") return false;
  if (newStatus === "done" || newStatus === "cancelled") return false;
  if (!newAssignee || newAssignee === actorId) return false;
  if (!meetsThreshold(newPriority, threshold)) return false;

  if (oldAssignee !== newAssignee) return true;
  if (
    oldPriority !== newPriority &&
    !meetsThreshold(oldPriority, threshold)
  ) {
    return true;
  }
  return false;
}
