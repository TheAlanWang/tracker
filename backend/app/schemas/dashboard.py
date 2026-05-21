from datetime import date, datetime
from pydantic import BaseModel


class DashboardTask(BaseModel):
    id: str
    identifier: str
    title: str
    status: str
    workspace_slug: str
    project_key: str
    project_name: str
    due_date: date | None
    updated_at: datetime


class DashboardSprint(BaseModel):
    id: str
    name: str
    workspace_slug: str
    project_key: str
    start_at: datetime | None
    end_at: datetime | None


class DashboardStats(BaseModel):
    open: int
    done_this_week: int
    overdue: int
    in_review: int


class DashboardActivity(BaseModel):
    id: str
    task_id: str
    task_identifier: str
    task_title: str
    workspace_slug: str
    project_key: str
    actor_id: str | None
    actor_email: str | None
    actor_display_name: str | None
    actor_avatar_url: str | None = None
    actor_avatar_color: str | None = None
    action: str
    payload: dict
    created_at: datetime


class DashboardResponse(BaseModel):
    assigned_to_me: list[DashboardTask]
    active_sprints: list[DashboardSprint]
    due_this_week: list[DashboardTask]
    overdue: list[DashboardTask]
    done_this_week_tasks: list[DashboardTask]
    stats: DashboardStats
    recent_activity: list[DashboardActivity]
