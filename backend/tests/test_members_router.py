from unittest.mock import patch

from app.schemas.member import MemberResponse


def _m(**over):
    base = dict(
        user_id="user-1", workspace_id="ws-1", role="owner",
        created_at="2026-05-14T00:00:00Z",
    )
    base.update(over)
    return MemberResponse(**base)


def test_list_members_200(client, make_token):
    with patch("app.routers.members.list_members", return_value=[_m()]):
        token = make_token(sub="user-1")
        response = client.get(
            "/workspaces/ws-1/members",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        assert len(response.json()) == 1


def test_list_members_403_when_not_member(client, make_token):
    from app.services.members import NotAMemberError
    with patch("app.routers.members.list_members", side_effect=NotAMemberError("ws-1")):
        token = make_token(sub="outsider")
        response = client.get(
            "/workspaces/ws-1/members",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 403
