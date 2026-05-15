from datetime import date, datetime
from pydantic import BaseModel


class DashboardTask(BaseModel):
    id: str
    identifier: str
    title: str
    status: str
    workspace_slug: str
    project_key: str
    due_date: date | None
    updated_at: datetime


class DashboardSprint(BaseModel):
    id: str
    name: str
    workspace_slug: str
    project_key: str
    start_at: datetime | None
    end_at: datetime | None


class DashboardResponse(BaseModel):
    assigned_to_me: list[DashboardTask]
    active_sprints: list[DashboardSprint]
    due_this_week: list[DashboardTask]
