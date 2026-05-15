from datetime import datetime

from pydantic import BaseModel, Field


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=10000)


class CommentUpdate(BaseModel):
    body: str = Field(min_length=1, max_length=10000)


class CommentResponse(BaseModel):
    id: str
    issue_id: str
    author_id: str | None
    body: str
    created_at: datetime
    updated_at: datetime
