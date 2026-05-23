from datetime import datetime
from typing import Literal

from pydantic import BaseModel

ActivityAction = Literal[
    "status_changed",
    "priority_changed",
    "assignee_changed",
    "sprint_changed",
    "commented",
    "created",
    "updated",
]


class ActivityResponse(BaseModel):
    id: str
    task_id: str
    actor_id: str | None
    action: ActivityAction
    payload: dict
    created_at: datetime


class MyActivityResponse(BaseModel):
    """Enriched activity row for the /me/activity feed. Includes
    `task_identifier` (e.g. 'TRAC-23') so AI consumers can reference
    the task by its human handle without a second lookup."""

    id: str
    task_id: str
    task_identifier: str | None
    actor_id: str | None
    action: ActivityAction
    payload: dict
    created_at: datetime
