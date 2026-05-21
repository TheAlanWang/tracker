from datetime import datetime
from typing import Literal

from pydantic import BaseModel

NotificationType = Literal[
    "assigned",
    "mentioned",
    "commented",
    "status_changed",
    "invitation_accepted",
    "invitation_declined",
    "unblocked",
]


class NotificationResponse(BaseModel):
    id: str
    user_id: str
    type: NotificationType
    # Nullable for non-task-centric notifications (e.g., invitation outcomes).
    task_id: str | None = None
    actor_id: str | None
    actor_email: str | None = None
    actor_display_name: str | None = None
    actor_avatar_url: str | None = None
    actor_avatar_color: str | None = None
    payload: dict
    read_at: datetime | None
    created_at: datetime
