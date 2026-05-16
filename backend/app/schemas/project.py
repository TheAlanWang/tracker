from datetime import datetime

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    # Optional: backend derives a unique key from name if absent.
    key: str | None = Field(
        default=None, min_length=2, max_length=10, pattern=r"^[A-Z][A-Z0-9]*$"
    )
    description: str | None = Field(default=None, max_length=1000)


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=1000)


class ProjectResponse(BaseModel):
    id: str
    workspace_id: str
    name: str
    key: str
    next_task_number: int
    description: str | None
    created_at: datetime
    updated_at: datetime
