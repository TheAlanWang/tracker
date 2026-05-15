from unittest.mock import patch

from app.schemas.sprint import SprintResponse


def _s(**over):
    base = dict(
        id="s-1", project_id="p-1", name="Sprint 1", status="planned",
        start_at=None, end_at=None,
        created_at="2026-05-14T00:00:00Z", updated_at="2026-05-14T00:00:00Z",
    )
    base.update(over)
    return SprintResponse(**base)


def test_list_sprints_200(client, make_token):
    with patch("app.routers.sprints.list_sprints", return_value=[_s()]):
        token = make_token(sub="u-1")
        r = client.get("/projects/p-1/sprints", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert len(r.json()) == 1


def test_create_sprint_201(client, make_token):
    with patch("app.routers.sprints.create_sprint", return_value=_s(name="New")):
        token = make_token(sub="u-1")
        r = client.post(
            "/projects/p-1/sprints",
            json={"name": "New"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 201


def test_get_sprint_200(client, make_token):
    with patch("app.routers.sprints.get_sprint", return_value=_s()):
        token = make_token(sub="u-1")
        r = client.get("/sprints/s-1", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200


def test_get_sprint_404(client, make_token):
    from app.services.sprints import SprintNotFoundError
    with patch("app.routers.sprints.get_sprint", side_effect=SprintNotFoundError("s-1")):
        token = make_token(sub="u-1")
        r = client.get("/sprints/x", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 404


def test_patch_sprint_200(client, make_token):
    with patch("app.routers.sprints.update_sprint", return_value=_s(name="Renamed")):
        token = make_token(sub="u-1")
        r = client.patch(
            "/sprints/s-1",
            json={"name": "Renamed"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200


def test_delete_sprint_204(client, make_token):
    with patch("app.routers.sprints.delete_sprint", return_value=None):
        token = make_token(sub="u-1")
        r = client.delete("/sprints/s-1", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 204


def test_start_sprint_200(client, make_token):
    with patch("app.routers.sprints.start_sprint", return_value=_s(status="active")):
        token = make_token(sub="u-1")
        r = client.post("/sprints/s-1/start", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert r.json()["status"] == "active"


def test_start_sprint_invalid_transition_422(client, make_token):
    from app.services.sprints import SprintInvalidTransitionError
    with patch(
        "app.routers.sprints.start_sprint",
        side_effect=SprintInvalidTransitionError("s-1"),
    ):
        token = make_token(sub="u-1")
        r = client.post("/sprints/s-1/start", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 422


def test_start_sprint_another_active_422(client, make_token):
    from app.services.sprints import AnotherActiveSprintError
    with patch(
        "app.routers.sprints.start_sprint",
        side_effect=AnotherActiveSprintError("p-1"),
    ):
        token = make_token(sub="u-1")
        r = client.post("/sprints/s-1/start", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 422
        assert "another active sprint" in r.json()["detail"].lower()


def test_complete_sprint_200(client, make_token):
    with patch(
        "app.routers.sprints.complete_sprint",
        return_value={"completed": "s-1", "rolled_over_to": "s-2", "count": 3},
    ):
        token = make_token(sub="u-1")
        r = client.post("/sprints/s-1/complete", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        body = r.json()
        assert body["completed"] == "s-1"
        assert body["rolled_over_to"] == "s-2"
        assert body["count"] == 3


def test_complete_sprint_not_active_422(client, make_token):
    from app.services.sprints import SprintInvalidTransitionError
    with patch(
        "app.routers.sprints.complete_sprint",
        side_effect=SprintInvalidTransitionError("s-1"),
    ):
        token = make_token(sub="u-1")
        r = client.post("/sprints/s-1/complete", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 422
