from datetime import datetime
from typing import Literal

from pydantic import BaseModel


InvitationStatus = Literal[
    "pending", "accepted", "declined", "revoked", "expired"
]


class InvitationCreate(BaseModel):
    email: str
    role: Literal["member", "admin"] = "member"


class InvitationResponse(BaseModel):
    id: str
    workspace_id: str
    workspace_name: str | None = None
    workspace_slug: str | None = None
    invited_email: str
    role: str
    status: InvitationStatus
    invited_by: str
    invited_by_email: str | None = None
    invited_by_display_name: str | None = None
    created_at: datetime
    responded_at: datetime | None = None
    expires_at: datetime
