from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


# Keep these in sync with the task_status / task_priority enums in
# migrations/20260516000000_issues.sql (renamed to task_status/task_priority
# by migration 20260522000000_rename_issues_to_tasks.sql).
TaskStatus = Literal[
    "backlog", "todo", "in_progress", "in_review", "done", "cancelled"
]
TaskPriority = Literal[
    "no_priority", "urgent", "high", "medium", "low"
]


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=10000)
    status: TaskStatus = "backlog"
    priority: TaskPriority = "no_priority"
    assignee_id: str | None = None
    due_date: date | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=10000)
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    assignee_id: str | None = None
    due_date: date | None = None
    sprint_id: str | None = None


class TaskResponse(BaseModel):
    id: str
    workspace_id: str
    project_id: str
    sprint_id: str | None
    parent_id: str | None
    identifier: str
    title: str
    description: str
    status: TaskStatus
    priority: TaskPriority
    assignee_id: str | None
    reporter_id: str | None
    due_date: date | None
    position: float
    created_at: datetime
    updated_at: datetime


class TaskMove(BaseModel):
    status: TaskStatus
    position: float
