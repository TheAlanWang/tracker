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
