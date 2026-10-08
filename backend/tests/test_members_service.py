"""update_member permissions + nickname as the effective display name."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.members import (
    CannotModifyOwnerError,
    MemberPermissionError,
    _member_response,
    update_member,
)

_ROW = {
    "user_id": "target",
    "workspace_id": "ws-1",
    "role": "member",
    "created_at": "2026-05-14T00:00:00Z",
    "nickname": None,
}


def _supabase(target_row: dict) -> MagicMock:
    sb = MagicMock()
    # Both the target-role lookup and the post-update re-read are
    # select().eq().eq().execute(); serve the same row to both.
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        target_row
    ]
    return sb


async def _update(caller_role, *, caller="caller", target_row=_ROW, **changes):
    sb = _supabase(target_row)
    with patch(
        "app.services.members._get_caller_role", AsyncMock(return_value=caller_role)
    ), patch(
        "app.services.members._lookup_user_profiles",
        AsyncMock(return_value={"target": {"email": "t@x.com", "display_name": "Global"}}),
    ):
        result = await update_member(
            sb,
            user_id=caller,
            workspace_id="ws-1",
            target_user_id="target",
            changes=changes,
        )
    return sb, result


@pytest.mark.parametrize("caller_role", ["owner", "admin"])
async def test_manager_can_change_role(caller_role):
    sb, _ = await _update(caller_role, role="admin")
    sb.table.return_value.update.assert_called_once_with({"role": "admin"})


async def test_member_cannot_change_role():
    with pytest.raises(MemberPermissionError):
        await _update("member", role="admin")


async def test_owner_role_is_fixed():
    with pytest.raises(CannotModifyOwnerError):
        await _update("admin", target_row={**_ROW, "role": "owner"}, role="member")


@pytest.mark.parametrize("caller_role", ["owner", "admin"])
async def test_manager_can_set_someone_elses_nickname(caller_role):
    sb, _ = await _update(caller_role, nickname="Bobby")
    sb.table.return_value.update.assert_called_once_with({"nickname": "Bobby"})


async def test_member_can_set_own_nickname():
    sb, _ = await _update("member", caller="target", nickname="Me")
    sb.table.return_value.update.assert_called_once_with({"nickname": "Me"})


async def test_member_cannot_set_other_members_nickname():
    with pytest.raises(MemberPermissionError):
        await _update("member", caller="someone-else", nickname="Rude")


async def test_non_member_cannot_update():
    with pytest.raises(MemberPermissionError):
        await _update(None, caller="target", nickname="x")


def test_nickname_is_effective_display_name():
    r = _member_response({**_ROW, "nickname": "Bobby"}, {"display_name": "Robert"})
    assert (r.display_name, r.nickname, r.profile_display_name) == ("Bobby", "Bobby", "Robert")


def test_no_nickname_falls_back_to_global_name():
    r = _member_response(_ROW, {"display_name": "Robert", "email": "r@x.com"})
    assert (r.display_name, r.nickname) == ("Robert", None)


def test_missing_nickname_column_is_tolerated():
    # Pre-migration rows have no "nickname" key at all.
    row = {k: v for k, v in _ROW.items() if k != "nickname"}
    assert _member_response(row, {"display_name": "Robert"}).display_name == "Robert"
