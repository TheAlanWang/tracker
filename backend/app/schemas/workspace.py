from datetime import datetime

from pydantic import BaseModel, Field


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    slug: str = Field(min_length=2, max_length=50, pattern=r"^[a-z0-9-]+$")


class WorkspaceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    # Partial merge of feature flags. Only keys present in the payload are
    # changed; unspecified keys preserve whatever was stored. Currently
    # known keys: "goals" (bool).
    features: dict[str, bool] | None = None


class WorkspaceResponse(BaseModel):
    id: str
    name: str
    slug: str
    owner_id: str
    features: dict[str, bool] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime
