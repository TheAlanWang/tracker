from unittest.mock import patch

from app.schemas.activity import ActivityResponse


def _a(**over):
    base = dict(
        id="a-1",
        task_id="i-1",
        actor_id="u-1",
        action="status_changed",
        payload={"from": "backlog", "to": "in_progress"},
        created_at="2026-05-14T00:00:00Z",
    )
    base.update(over)
    return ActivityResponse(**base)


async def test_list_activity_200(client, make_token):
    with patch(
        "app.routers.activity.list_task_activity",
        return_value=[_a(), _a(id="a-2", action="commented")],
    ):
        token = make_token(sub="u-1")
        r = client.get(
            "/tasks/i-1/activity",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        assert len(r.json()) == 2
