from unittest.mock import patch


async def test_me_requires_auth(client):
    response = client.get("/me")
    assert response.status_code == 401


async def test_me_returns_user_info_with_empty_workspaces(client, make_token):
    with patch("app.routers.me.list_workspaces_for_user", return_value=[]):
        token = make_token(sub="user-xyz", email="user@example.com")
        response = client.get("/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        body = response.json()
        assert body["id"] == "user-xyz"
        assert body["email"] == "user@example.com"
        assert body["workspaces"] == []


async def test_me_returns_workspaces_when_user_has_some(client, make_token):
    from app.schemas.workspace import WorkspaceResponse

    fake_ws = WorkspaceResponse(
        id="ws-1", name="Engineering", slug="eng",
        owner_id="user-xyz",
        created_at="2026-05-14T00:00:00Z",
        updated_at="2026-05-14T00:00:00Z",
    )
    with patch("app.routers.me.list_workspaces_for_user", return_value=[fake_ws]):
        token = make_token(sub="user-xyz", email="u@e.com")
        response = client.get("/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        body = response.json()
        assert len(body["workspaces"]) == 1
        assert body["workspaces"][0]["slug"] == "eng"
