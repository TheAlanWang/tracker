from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from app.services._user_profiles import (
    fetch_user_profiles,
    find_user_id_by_email,
)


def _auth_user(uid, email, name=None):
    return SimpleNamespace(
        id=uid, email=email, user_metadata={"display_name": name} if name else {}
    )


def _supabase_with_rpc(data):
    sb = MagicMock()
    sb.rpc.return_value.execute.return_value.data = data
    return sb


def _supabase_rpc_missing(pages):
    """RPC fails (migration not applied yet); list_users serves `pages`."""
    sb = MagicMock()
    sb.rpc.side_effect = Exception("PGRST202: function not found")
    sb.auth.admin.list_users = AsyncMock(side_effect=pages)
    return sb


async def test_fetch_profiles_uses_rpc_with_deduped_ids():
    sb = _supabase_with_rpc(
        [
            {
                "id": "u-1",
                "email": "a@x.com",
                "display_name": "Alan",
                "avatar_url": None,
                "avatar_color": "blue",
            }
        ]
    )

    result = await fetch_user_profiles(sb, ["u-1", "u-1", None])

    sb.rpc.assert_called_once_with("get_user_profiles", {"uids": ["u-1"]})
    assert result == {
        "u-1": {
            "email": "a@x.com",
            "display_name": "Alan",
            "avatar_url": None,
            "avatar_color": "blue",
        }
    }


async def test_fetch_profiles_empty_ids_skips_lookup():
    sb = MagicMock()
    assert await fetch_user_profiles(sb, []) == {}
    sb.rpc.assert_not_called()


async def test_fetch_profiles_fallback_walks_every_page():
    # The original bug: list_users() only returned page 1, so a user on a
    # later page vanished. The fallback must keep paging.
    page1 = [_auth_user(f"u-{i}", f"{i}@x.com") for i in range(1000)]
    page2 = [_auth_user("late", "late@x.com", "Late User")]
    sb = _supabase_rpc_missing([page1, page2])

    result = await fetch_user_profiles(sb, ["late"])

    assert result["late"]["display_name"] == "Late User"
    assert sb.auth.admin.list_users.await_count == 2


async def test_fetch_profiles_returns_empty_when_everything_fails():
    sb = MagicMock()
    sb.rpc.side_effect = Exception("boom")
    sb.auth.admin.list_users = AsyncMock(side_effect=Exception("boom"))
    assert await fetch_user_profiles(sb, ["u-1"]) == {}


async def test_find_user_by_email_normalizes_input():
    sb = _supabase_with_rpc("u-9")

    assert await find_user_id_by_email(sb, "  Alan@X.com ") == "u-9"
    sb.rpc.assert_called_once_with(
        "find_user_id_by_email", {"p_email": "alan@x.com"}
    )


async def test_find_user_by_email_not_found():
    sb = _supabase_with_rpc(None)
    assert await find_user_id_by_email(sb, "nobody@x.com") is None


async def test_find_user_by_email_fallback_matches_case_insensitively():
    sb = _supabase_rpc_missing([[_auth_user("u-3", "Mixed@X.com")]])
    assert await find_user_id_by_email(sb, "mixed@x.com") == "u-3"


async def test_workspace_nickname_overrides_display_name():
    sb = _supabase_with_rpc(
        [
            {"id": "u-1", "email": "a@x.com", "display_name": "Robert", "avatar_url": None, "avatar_color": None},
            {"id": "u-2", "email": "b@x.com", "display_name": "Alice", "avatar_url": None, "avatar_color": None},
        ]
    )
    sb.table.return_value.select.return_value.eq.return_value.in_.return_value.execute.return_value.data = [
        {"user_id": "u-1", "nickname": "Bobby"},
        {"user_id": "u-2", "nickname": None},
    ]

    result = await fetch_user_profiles(sb, ["u-1", "u-2"], workspace_id="ws-1")

    assert result["u-1"]["display_name"] == "Bobby"
    assert result["u-1"]["profile_display_name"] == "Robert"
    assert result["u-2"]["display_name"] == "Alice"


async def test_nickname_lookup_failure_keeps_global_names():
    sb = _supabase_with_rpc(
        [{"id": "u-1", "email": "a@x.com", "display_name": "Robert", "avatar_url": None, "avatar_color": None}]
    )
    sb.table.side_effect = Exception("column workspace_members.nickname does not exist")

    result = await fetch_user_profiles(sb, ["u-1"], workspace_id="ws-1")

    assert result["u-1"]["display_name"] == "Robert"
