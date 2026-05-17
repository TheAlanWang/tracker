from datetime import datetime

from pydantic import BaseModel


class WatcherResponse(BaseModel):
    task_id: str
    user_id: str
    email: str | None = None
    display_name: str | None = None
    created_at: datetime


class WatchedTaskResponse(BaseModel):
    """A task the current user is watching, enriched with project + workspace
    routing info so the frontend can render rows that link to the task."""

    id: str
    identifier: str
    title: str
    status: str
    priority: str
    workspace_id: str
    workspace_slug: str
    project_id: str
    project_key: str
    project_name: str
    assignee_id: str | None
    reporter_id: str | None
    due_date: str | None
    created_at: datetime
    updated_at: datetime
    watching_since: datetime
