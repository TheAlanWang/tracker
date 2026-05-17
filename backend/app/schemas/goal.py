from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


GoalStatus = Literal["active", "achieved", "paused", "dropped"]


class GoalCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    parent_goal_id: str | None = None


class GoalUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    status: GoalStatus | None = None
    parent_goal_id: str | None = None
    position: float | None = None


class GoalResponse(BaseModel):
    id: str
    workspace_id: str
    parent_goal_id: str | None
    title: str
    description: str
    status: GoalStatus
    position: float
    created_at: datetime
    updated_at: datetime
    created_by: str | None
    # Roll-up counts populated by the service layer. Direct counts the
    # tasks attached to this goal; descendant counts include subtree.
    direct_task_count: int = 0
    descendant_task_count: int = 0
    done_task_count: int = 0
