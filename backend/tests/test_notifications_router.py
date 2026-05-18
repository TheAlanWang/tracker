from unittest.mock import patch

from app.schemas.notification import NotificationResponse


def _n(**over):
    base = dict(
        id="n-1",
        user_id="u-1",
        type="assigned",
        task_id="i-1",
        actor_id="u-2",
        payload={"identifier": "P-1", "title": "Fix"},
        read_at=None,
        created_at="2026-05-14T00:00:00Z",
    )
    base.update(over)
    return NotificationResponse(**base)


async def test_list_notifications_200(client, make_token):
    with patch(
        "app.routers.notifications.list_my_notifications",
        return_value=[_n(), _n(id="n-2", type="commented")],
    ):
        token = make_token(sub="u-1")
        r = client.get(
            "/me/notifications", headers={"Authorization": f"Bearer {token}"}
        )
        assert r.status_code == 200
        assert len(r.json()) == 2


async def test_mark_all_read_returns_count(client, make_token):
    with patch("app.routers.notifications.mark_all_read", return_value=3):
        token = make_token(sub="u-1")
        r = client.post(
            "/me/notifications/read-all",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        assert r.json() == {"count": 3}
