from datetime import datetime
from typing import Literal

from pydantic import BaseModel


WorkspaceRole = Literal["owner", "admin", "member"]


class MemberInvite(BaseModel):
    email: str
    role: WorkspaceRole = "member"


class MemberRoleUpdate(BaseModel):
    role: WorkspaceRole


class MemberResponse(BaseModel):
    user_id: str
    workspace_id: str
    role: WorkspaceRole
    created_at: datetime
    email: str | None = None
    display_name: str | None = None
