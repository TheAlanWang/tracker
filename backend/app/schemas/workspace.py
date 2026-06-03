from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    slug: str = Field(min_length=2, max_length=50, pattern=r"^[a-z0-9-]+$")


class WorkspaceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    # Renaming the slug rewrites every URL in this workspace
    # (/w/<slug>/...). External bookmarks / shared links / MCP configs
    # all break. Frontend gates this behind a confirm dialog.
    slug: str | None = Field(
        default=None, min_length=2, max_length=50, pattern=r"^[a-z0-9-]+$"
    )
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
    # Subscription tier. Flipped via SQL today; Stripe webhook later.
    # Client cannot mutate this through WorkspaceUpdate.
    plan: Literal["free", "pro"] = "free"
    # True when a Stripe customer exists for this workspace (i.e. real billing,
    # not a manually-comped Pro). The UI uses it to decide whether to offer
    # "Manage billing". Derived from stripe_customer_id; never client-settable.
    has_billing: bool = False
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="before")
    @classmethod
    def _derive_has_billing(cls, data):
        if isinstance(data, dict) and "has_billing" not in data:
            return {**data, "has_billing": bool(data.get("stripe_customer_id"))}
        return data


class WorkspaceUsageResponse(BaseModel):
    # Bytes of task-image uploads owned by the workspace. Avatars excluded
    # (user-global). Display-only — not enforced. Extensible: add
    # emails_this_month etc. here when those counters land.
    storage_bytes: int
    # In-app AI agent messages spent this calendar month. Unlike storage,
    # this one IS enforced (the /agent route 402s at the cap); shown here so
    # the Billing usage panel reflects the live counter.
    agent_messages_used: int = 0
