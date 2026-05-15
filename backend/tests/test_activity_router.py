from unittest.mock import patch

from app.schemas.activity import ActivityResponse


def _a(**over):
    base = dict(
        id="a-1",
        issue_id="i-1",
        actor_id="u-1",
        action="status_changed",
        payload={"from": "backlog", "to": "in_progress"},
        created_at="2026-05-14T00:00:00Z",
    )
    base.update(over)
    return ActivityResponse(**base)


def test_list_activity_200(client, make_token):
    with patch(
        "app.routers.activity.list_issue_activity",
        return_value=[_a(), _a(id="a-2", action="commented")],
    ):
        token = make_token(sub="u-1")
        r = client.get(
            "/issues/i-1/activity",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        assert len(r.json()) == 2


def test_list_activity_404(client, make_token):
    from app.services.activity import IssueNotFoundError

    with patch(
        "app.routers.activity.list_issue_activity",
        side_effect=IssueNotFoundError("i-missing"),
    ):
        token = make_token(sub="u-1")
        r = client.get(
            "/issues/i-missing/activity",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 404
