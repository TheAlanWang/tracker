from unittest.mock import patch

from app.schemas.project import ProjectResponse


def _p(**over):
    base = dict(
        id="p-1", workspace_id="ws-1", name="Backend", key="BE",
        next_issue_number=1, description=None,
        created_at="2026-05-14T00:00:00Z", updated_at="2026-05-14T00:00:00Z",
    )
    base.update(over)
    return ProjectResponse(**base)


def test_list_projects_200(client, make_token):
    with patch("app.routers.projects.list_projects", return_value=[_p()]):
        token = make_token(sub="user-1")
        response = client.get(
            "/workspaces/ws-1/projects",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        assert len(response.json()) == 1


def test_list_projects_403_when_not_member(client, make_token):
    from app.services.projects import ProjectPermissionError
    with patch(
        "app.routers.projects.list_projects",
        side_effect=ProjectPermissionError("ws-1"),
    ):
        token = make_token(sub="x")
        response = client.get(
            "/workspaces/ws-1/projects",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 403


def test_create_project_201(client, make_token):
    with patch("app.routers.projects.create_project", return_value=_p()):
        token = make_token(sub="user-1")
        response = client.post(
            "/workspaces/ws-1/projects",
            json={"name": "Backend", "key": "BE"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 201


def test_create_project_duplicate_key_409(client, make_token):
    from app.services.projects import ProjectKeyExistsError
    with patch(
        "app.routers.projects.create_project",
        side_effect=ProjectKeyExistsError("BE"),
    ):
        token = make_token(sub="user-1")
        response = client.post(
            "/workspaces/ws-1/projects",
            json={"name": "X", "key": "BE"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 409
