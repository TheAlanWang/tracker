from unittest.mock import patch

from app.schemas.task import TaskResponse


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
    return TaskResponse(**base)


def test_list_tasks_200(client, make_token):
    with patch("app.routers.tasks.list_tasks", return_value=[_r()]):
        token = make_token(sub="u-1")
        response = client.get(
            "/projects/p-1/tasks",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        assert len(response.json()) == 1


def test_create_task_201(client, make_token):
    with patch("app.routers.tasks.create_task", return_value=_r(title="New")):
        token = make_token(sub="u-1")
        response = client.post(
            "/projects/p-1/tasks",
            json={"title": "New"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 201
        assert response.json()["identifier"] == "BE-1"


def test_create_task_403(client, make_token):
    from app.services.tasks import TaskPermissionError
    with patch(
        "app.routers.tasks.create_task",
        side_effect=TaskPermissionError("p-1"),
    ):
        token = make_token(sub="outsider")
        response = client.post(
            "/projects/p-1/tasks",
            json={"title": "X"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 403


def test_get_task_200(client, make_token):
    with patch("app.routers.tasks.get_task", return_value=_r()):
        token = make_token(sub="u-1")
        response = client.get(
            "/tasks/i-1", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200


def test_move_task_200(client, make_token):
    with patch(
        "app.routers.tasks.move_task",
        return_value=_r(status="in_progress", position=1500.0),
    ):
        token = make_token(sub="u-1")
        response = client.post(
            "/tasks/i-1/move",
            json={"status": "in_progress", "position": 1500.0},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "in_progress"
        assert body["position"] == 1500.0
