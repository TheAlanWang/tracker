from datetime import datetime

from pydantic import BaseModel, Field


class ChecklistItemCreate(BaseModel):
    text: str = Field(min_length=1, max_length=200)


class ChecklistItemUpdate(BaseModel):
    text: str | None = Field(default=None, min_length=1, max_length=200)
    done: bool | None = None
    position: float | None = None


class ChecklistItemResponse(BaseModel):
    id: str
    task_id: str
    text: str
    done: bool
    position: float
    created_at: datetime
    updated_at: datetime
