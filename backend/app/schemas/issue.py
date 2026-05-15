from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


# Keep these in sync with the issue_status / issue_priority enums in
# migrations/20260516000000_issues.sql.
IssueStatus = Literal[
    "backlog", "todo", "in_progress", "in_review", "done", "cancelled"
]
IssuePriority = Literal[
    "no_priority", "urgent", "high", "medium", "low"
]


class IssueCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=10000)
    status: IssueStatus = "backlog"
    priority: IssuePriority = "no_priority"
    assignee_id: str | None = None
    due_date: date | None = None


class IssueUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=10000)
    status: IssueStatus | None = None
    priority: IssuePriority | None = None
    assignee_id: str | None = None
    due_date: date | None = None


class IssueResponse(BaseModel):
    id: str
    workspace_id: str
    project_id: str
    sprint_id: str | None
    parent_id: str | None
    identifier: str
    title: str
    description: str
    status: IssueStatus
    priority: IssuePriority
    assignee_id: str | None
    reporter_id: str | None
    due_date: date | None
    position: float
    created_at: datetime
    updated_at: datetime
