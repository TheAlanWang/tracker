from unittest.mock import patch

from app.schemas.member import MemberResponse


def _m(**over):
    base = dict(
        user_id="user-1", workspace_id="ws-1", role="owner",
        created_at="2026-05-14T00:00:00Z",
    )
    base.update(over)
    return MemberResponse(**base)


async def test_list_members_200(client, make_token):
    with patch("app.routers.members.list_members", return_value=[_m()]):
        token = make_token(sub="user-1")
        response = client.get(
            "/workspaces/ws-1/members",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        assert len(response.json()) == 1


async def test_list_members_403_when_not_member(client, make_token):
    from app.services.members import NotAMemberError
    with patch("app.routers.members.list_members", side_effect=NotAMemberError("ws-1")):
        token = make_token(sub="outsider")
        response = client.get(
            "/workspaces/ws-1/members",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 403


async def test_patch_passes_only_sent_fields(client, make_token):
    from unittest.mock import AsyncMock

    mock = AsyncMock(return_value=_m(role="member"))
    with patch("app.routers.members.update_member", mock):
        token = make_token(sub="user-1")
        r = client.patch(
            "/workspaces/ws-1/members/user-2",
            json={"nickname": "  Bobby  "},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert r.status_code == 200
    assert mock.await_args.kwargs["changes"] == {"nickname": "Bobby"}


async def test_patch_null_or_blank_nickname_clears(client, make_token):
    from unittest.mock import AsyncMock

    mock = AsyncMock(return_value=_m(role="member"))
    with patch("app.routers.members.update_member", mock):
        token = make_token(sub="user-1")
        for body in ({"nickname": None}, {"nickname": "   "}):
            client.patch(
                "/workspaces/ws-1/members/user-2",
                json=body,
                headers={"Authorization": f"Bearer {token}"},
            )
            assert mock.await_args.kwargs["changes"] == {"nickname": None}


async def test_patch_rejects_long_nickname_and_null_role(client, make_token):
    token = make_token(sub="user-1")
    headers = {"Authorization": f"Bearer {token}"}
    assert client.patch(
        "/workspaces/ws-1/members/user-2", json={"nickname": "x" * 51}, headers=headers
    ).status_code == 422
    assert client.patch(
        "/workspaces/ws-1/members/user-2", json={"role": None}, headers=headers
    ).status_code == 422
