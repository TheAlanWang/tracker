from datetime import datetime

from pydantic import BaseModel, Field


class LabelCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    # Hex color, e.g. #3b82f6
    color: str = Field(min_length=4, max_length=9, pattern=r"^#[0-9a-fA-F]{3,8}$")


class LabelResponse(BaseModel):
    id: str
    workspace_id: str
    name: str
    color: str
    created_at: datetime
