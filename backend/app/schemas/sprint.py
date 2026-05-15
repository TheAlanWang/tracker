from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


# Keep in sync with sprint_status enum in migrations/20260517000000_sprints.sql.
SprintStatus = Literal["planned", "active", "completed"]


class SprintCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    start_at: datetime | None = None
    end_at: datetime | None = None


class SprintUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    start_at: datetime | None = None
    end_at: datetime | None = None


class SprintResponse(BaseModel):
    id: str
    project_id: str
    name: str
    status: SprintStatus
    start_at: datetime | None
    end_at: datetime | None
    created_at: datetime
    updated_at: datetime
