from pydantic import BaseModel


class WorkspaceSummary(BaseModel):
    id: str
    slug: str
    name: str


class MeResponse(BaseModel):
    id: str
    email: str | None = None
    display_name: str | None = None
    workspaces: list[WorkspaceSummary] = []


class ProfileUpdate(BaseModel):
    display_name: str | None = None
