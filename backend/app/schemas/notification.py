from datetime import datetime
from typing import Literal

from pydantic import BaseModel

NotificationType = Literal["assigned", "mentioned", "commented", "status_changed"]


class NotificationResponse(BaseModel):
    id: str
    user_id: str
    type: NotificationType
    task_id: str
    actor_id: str | None
    payload: dict
    read_at: datetime | None
    created_at: datetime
