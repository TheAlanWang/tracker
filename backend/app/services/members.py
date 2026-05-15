from supabase import Client

from app.schemas.member import MemberResponse


class MemberError(Exception):
    pass


class NotAMemberError(MemberError):
    pass


def list_members(
    supabase: Client, *, user_id: str, workspace_id: str
) -> list[MemberResponse]:
    # Caller must be a member to list
    own_rows = (
        supabase.table("workspace_members")
        .select("role")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .execute()
        .data
    )
    if not own_rows:
        raise NotAMemberError(workspace_id)

    rows = (
        supabase.table("workspace_members")
        .select("*")
        .eq("workspace_id", workspace_id)
        .execute()
        .data
    )
    return [MemberResponse(**r) for r in rows]
