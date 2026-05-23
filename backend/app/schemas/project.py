from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl


EnvironmentType = Literal[
    "production", "staging", "dev",
    "repo", "docs", "design", "other",
]


# Mirrors the check constraint in 20260522210000_project_notify_urgent.sql.
# Values cascade — 'high' fires on high + urgent, 'any' fires on every
# assignment regardless of priority.
NotifyAssigneeThreshold = Literal["off", "urgent", "high", "any"]


class ProjectEnvironment(BaseModel):
    """A named link associated with the project — a production URL, staging
    URL, GitHub repo, design doc, etc. Stored alongside `description` so
    AI agents can fetch the full project context via a single get_project()
    call and pick the URL they need by `type`, without parsing prose."""

    # Name is an optional human label (e.g. "Marketing site" when you have
    # two production URLs). Empty string is fine — the type pill + URL
    # carry enough identity on their own.
    name: str = Field(default="", max_length=80)
    url: HttpUrl
    type: EnvironmentType


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
    # Changing the key renames every existing task identifier in the project
    # from OLD-N to NEW-N (Linear / Jira style). Same pattern as ProjectCreate.
    key: str | None = Field(
        default=None, min_length=2, max_length=10, pattern=r"^[A-Z][A-Z0-9]*$"
    )
    # Optional hex color for the sidebar dot. Empty string clears the
    # override, falling back to the deterministic hash on the frontend.
    color: str | None = Field(default=None, pattern=r"^(#[0-9A-Fa-f]{6})?$")
    # Replace the full environments array. None = don't touch; [] = clear.
    # Cap at 20 to keep individual project rows lean and prevent abuse.
    environments: list[ProjectEnvironment] | None = Field(
        default=None, max_length=20
    )
    # Threshold for sending email notifications on task assignment.
    # See NotifyAssigneeThreshold; defaults to 'off' at the column level
    # so existing projects don't start firing emails on deploy.
    notify_assignee_threshold: NotifyAssigneeThreshold | None = None


class ProjectResponse(BaseModel):
    id: str
    workspace_id: str
    name: str
    key: str
    next_task_number: int
    description: str | None
    color: str | None = None
    environments: list[ProjectEnvironment] = Field(default_factory=list)
    notify_assignee_threshold: NotifyAssigneeThreshold = "off"
    created_at: datetime
    updated_at: datetime
