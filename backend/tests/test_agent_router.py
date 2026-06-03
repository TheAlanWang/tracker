from unittest.mock import AsyncMock, patch

from app.services.usage import AgentQuotaExceededError

_BODY = {"messages": [{"role": "user", "content": "hi"}]}


async def test_agent_requires_auth(client):
    resp = client.post("/projects/p-1/agent", json=_BODY)
    assert resp.status_code == 401


async def test_history_requires_auth(client):
    assert client.get("/projects/p-1/agent/history").status_code == 401
    assert client.delete("/projects/p-1/agent/history").status_code == 401


async def test_agent_503_when_key_unset(client, make_token):
    # No ANTHROPIC_API_KEY in the test env → the route must 503 before doing
    # any work (mirrors billing's not-configured behavior).
    token = make_token()
    resp = client.post(
        "/projects/p-1/agent",
        json=_BODY,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 503


async def test_agent_402_when_quota_exceeded(client, make_token, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    from app.core.config import get_settings

    get_settings.cache_clear()

    project = {"id": "p-1", "workspace_id": "ws-1"}
    with (
        patch(
            "app.routers.agent._project_and_membership",
            new_callable=AsyncMock,
            return_value=project,
        ),
        patch(
            "app.routers.agent.consume_agent_message",
            new_callable=AsyncMock,
            side_effect=AgentQuotaExceededError(plan="free", cap=50, used=50),
        ),
    ):
        token = make_token()
        resp = client.post(
            "/projects/p-1/agent",
            json=_BODY,
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 402
    detail = resp.json()["detail"]
    assert detail["plan"] == "free"
    assert detail["cap"] == 50
