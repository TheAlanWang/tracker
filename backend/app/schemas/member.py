from datetime import datetime
from typing import Literal

from pydantic import BaseModel, field_validator


WorkspaceRole = Literal["owner", "admin", "member"]


class MemberInvite(BaseModel):
    email: str
    role: WorkspaceRole = "member"


NICKNAME_MAX_LEN = 50


class MemberUpdate(BaseModel):
    """PATCH body. Omit a field to leave it unchanged; `"nickname": null`
    (or blank) clears the workspace nickname."""

    role: WorkspaceRole | None = None
    nickname: str | None = None

    @field_validator("nickname")
    @classmethod
    def _normalize_nickname(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None
        if len(v) > NICKNAME_MAX_LEN:
            raise ValueError(f"nickname must be at most {NICKNAME_MAX_LEN} characters")
        return v


class MemberResponse(BaseModel):
    user_id: str
    workspace_id: str
    role: WorkspaceRole
    created_at: datetime
    email: str | None = None
    # Effective name in this workspace: nickname if set, else the user's
    # global display_name. Existing UI reads this, so nicknames show up
    # everywhere members are rendered without per-page changes.
    display_name: str | None = None
    avatar_url: str | None = None
    avatar_color: str | None = None
    # Raw per-workspace override (None = not set) and the user's own global
    # name — the members settings page needs both to edit the nickname.
    nickname: str | None = None
    profile_display_name: str | None = None
