from unittest.mock import patch

from app.schemas.issue import IssueResponse


def _r(**over):
    base = dict(
        id="i-1",
        workspace_id="ws-1",
        project_id="p-1",
        sprint_id=None,
        parent_id=None,
        identifier="BE-1",
        title="Test",
        description="",
        status="backlog",
        priority="no_priority",
        assignee_id=None,
        reporter_id="u-1",
        due_date=None,
        position=0.0,
        created_at="2026-05-14T00:00:00Z",
        updated_at="2026-05-14T00:00:00Z",
    )
    base.update(over)
    return IssueResponse(**base)


def test_list_issues_200(client, make_token):
    with patch("app.routers.issues.list_issues", return_value=[_r()]):
        token = make_token(sub="u-1")
        response = client.get(
            "/projects/p-1/issues",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        assert len(response.json()) == 1


def test_list_issues_status_filter(client, make_token):
    captured = {}

    def fake_list(supabase, *, user_id, project_id, status=None, sprint=None):
        captured["status"] = status
        return []

    with patch("app.routers.issues.list_issues", side_effect=fake_list):
        token = make_token(sub="u-1")
        response = client.get(
            "/projects/p-1/issues?status=todo",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        assert captured["status"] == "todo"


def test_list_issues_403_non_member(client, make_token):
    from app.services.issues import IssuePermissionError
    with patch(
        "app.routers.issues.list_issues",
        side_effect=IssuePermissionError("p-1"),
    ):
        token = make_token(sub="outsider")
        response = client.get(
            "/projects/p-1/issues",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 403


def test_create_issue_201(client, make_token):
    with patch("app.routers.issues.create_issue", return_value=_r(title="New")):
        token = make_token(sub="u-1")
        response = client.post(
            "/projects/p-1/issues",
            json={"title": "New"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 201
        assert response.json()["identifier"] == "BE-1"


def test_create_issue_403(client, make_token):
    from app.services.issues import IssuePermissionError
    with patch(
        "app.routers.issues.create_issue",
        side_effect=IssuePermissionError("p-1"),
    ):
        token = make_token(sub="outsider")
        response = client.post(
            "/projects/p-1/issues",
            json={"title": "X"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 403


def test_create_issue_404_project_not_found(client, make_token):
    from app.services.issues import ProjectNotFoundError
    with patch(
        "app.routers.issues.create_issue",
        side_effect=ProjectNotFoundError("p-1"),
    ):
        token = make_token(sub="u-1")
        response = client.post(
            "/projects/missing/issues",
            json={"title": "X"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 404


def test_get_issue_200(client, make_token):
    with patch("app.routers.issues.get_issue", return_value=_r()):
        token = make_token(sub="u-1")
        response = client.get(
            "/issues/i-1", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200


def test_get_issue_404(client, make_token):
    from app.services.issues import IssueNotFoundError
    with patch(
        "app.routers.issues.get_issue",
        side_effect=IssueNotFoundError("i-1"),
    ):
        token = make_token(sub="u-1")
        response = client.get(
            "/issues/missing", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 404


def test_patch_issue_200(client, make_token):
    with patch(
        "app.routers.issues.update_issue", return_value=_r(title="Renamed")
    ):
        token = make_token(sub="u-1")
        response = client.patch(
            "/issues/i-1",
            json={"title": "Renamed"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        assert response.json()["title"] == "Renamed"


def test_delete_issue_204(client, make_token):
    with patch("app.routers.issues.delete_issue", return_value=None):
        token = make_token(sub="u-1")
        response = client.delete(
            "/issues/i-1", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 204


def test_list_issues_with_sprint_filter(client, make_token):
    captured = {}

    def fake_list(supabase, *, user_id, project_id, status=None, sprint=None):
        captured["sprint"] = sprint
        return []

    with patch("app.routers.issues.list_issues", side_effect=fake_list):
        token = make_token(sub="u-1")
        r = client.get(
            "/projects/p-1/issues?sprint=null",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        assert captured["sprint"] == "null"


def test_move_issue_200(client, make_token):
    with patch(
        "app.routers.issues.move_issue",
        return_value=_r(status="in_progress", position=1500.0),
    ):
        token = make_token(sub="u-1")
        response = client.post(
            "/issues/i-1/move",
            json={"status": "in_progress", "position": 1500.0},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "in_progress"
        assert body["position"] == 1500.0


def test_move_issue_403(client, make_token):
    from app.services.issues import IssuePermissionError
    with patch(
        "app.routers.issues.move_issue",
        side_effect=IssuePermissionError("i-1"),
    ):
        token = make_token(sub="outsider")
        response = client.post(
            "/issues/i-1/move",
            json={"status": "done", "position": 0.0},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 403


def test_move_issue_404(client, make_token):
    from app.services.issues import IssueNotFoundError
    with patch(
        "app.routers.issues.move_issue",
        side_effect=IssueNotFoundError("missing"),
    ):
        token = make_token(sub="u-1")
        response = client.post(
            "/issues/missing/move",
            json={"status": "todo", "position": 0.0},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 404
