from pydantic import BaseModel


class WorkspaceSummary(BaseModel):
    id: str
    slug: str
    name: str


class MeResponse(BaseModel):
    id: str
    email: str | None = None
    display_name: str | None = None
    # Stored as a string in user_metadata.avatar_url. The frontend uploads to
    # the `avatars` Supabase Storage bucket, then sends the resulting public
    # URL back through ProfileUpdate so /me serves it on subsequent loads.
    avatar_url: str | None = None
    workspaces: list[WorkspaceSummary] = []


class ProfileUpdate(BaseModel):
    display_name: str | None = None
    # Pass an empty string to clear the avatar (treated as None server-side).
    avatar_url: str | None = None
