from unittest.mock import patch

import pytest

from app.schemas.workspace import WorkspaceResponse


def _ws(**over):
    base = dict(
        id="ws-1", name="Engineering", slug="eng",
        owner_id="user-1",
        created_at="2026-05-14T00:00:00Z",
        updated_at="2026-05-14T00:00:00Z",
    )
    base.update(over)
    return WorkspaceResponse(**base)


async def test_list_workspaces_returns_empty_for_new_user(client, make_token):
    with patch("app.routers.workspaces.list_workspaces_for_user", return_value=[]):
        token = make_token(sub="new-user")
        response = client.get("/workspaces", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        assert response.json() == []


async def test_create_workspace_201(client, make_token):
    with patch("app.routers.workspaces.create_workspace", return_value=_ws(name="My WS", slug="mine")):
        token = make_token(sub="user-1")
        response = client.post(
            "/workspaces",
            json={"name": "My WS", "slug": "mine"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 201
        body = response.json()
        assert body["name"] == "My WS"
        assert body["slug"] == "mine"


async def test_get_workspace_403_when_not_member(client, make_token):
    from app.services.workspaces import WorkspacePermissionError
    with patch("app.routers.workspaces.get_workspace", side_effect=WorkspacePermissionError("ws-1")):
        token = make_token(sub="outsider")
        response = client.get("/workspaces/ws-1", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 403
