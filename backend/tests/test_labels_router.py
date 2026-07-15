from unittest.mock import patch

import pytest

from app.schemas.label import LabelResponse

# Labels are shelved (2026-07): the router is no longer registered in
# app.main, so these route tests 404. Un-skip when the feature returns.
pytestmark = pytest.mark.skip(reason="labels feature shelved — router unregistered")


def _l(**over):
    base = dict(id="l-1", workspace_id="ws-1", name="bug", color="#ff0000", created_at="2026-05-14T00:00:00Z")
    base.update(over)
    return LabelResponse(**base)


async def test_list_labels_200(client, make_token):
    with patch("app.routers.labels.list_labels", return_value=[_l()]):
        token = make_token(sub="u-1")
        r = client.get("/workspaces/ws-1/labels", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert len(r.json()) == 1


async def test_create_label_201(client, make_token):
    with patch("app.routers.labels.create_label", return_value=_l(name="urgent")):
        token = make_token(sub="u-1")
        r = client.post(
            "/workspaces/ws-1/labels",
            json={"name": "urgent", "color": "#ff0000"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 201


async def test_attach_label_204(client, make_token):
    with patch("app.routers.labels.attach_label", return_value=None):
        token = make_token(sub="u-1")
        r = client.post(
            "/tasks/i-1/labels/l-1",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 204
