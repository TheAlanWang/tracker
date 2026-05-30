"""App-level smoke: /mcp is 401 without auth, OAuth endpoints are reachable, no env at import."""

import httpx
import pytest


def test_create_app_requires_config(monkeypatch):
    """Importing app shouldn't read env (config is loaded lazily by create_app)."""
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_JWT_SECRET", raising=False)
    from trackly_mcp import app as app_mod  # import must not raise
    assert hasattr(app_mod, "create_app")


@pytest.fixture
def configured_app(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://supa.test")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret-padded-32-bytes-hs256-ok")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon")
    monkeypatch.setenv("TRACKLY_API_URL", "https://tracker.test")
    monkeypatch.setenv("SERVER_BASE_URL", "https://mcp.test")
    from trackly_mcp.app import create_app
    return create_app()


async def test_mcp_returns_401_without_auth(configured_app):
    transport = httpx.ASGITransport(app=configured_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/mcp")
    assert r.status_code == 401


async def test_well_known_reachable(configured_app):
    transport = httpx.ASGITransport(app=configured_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/.well-known/oauth-protected-resource")
    assert r.status_code == 200


def test_authenticated_mcp_initialize_runs_session_manager(configured_app):
    """Regression: the mounted FastMCP app's lifespan must be driven by the
    parent, or the StreamableHTTP session manager's task group is never
    initialized and the first authenticated /mcp request 500s with
    "Task group is not initialized". TestClient(as a context manager) runs
    the lifespan, so this exercises the real startup path.
    """
    import time

    import jwt
    from starlette.testclient import TestClient

    token = jwt.encode(
        {
            "sub": "user-123",
            "aud": "authenticated",
            "iat": int(time.time()),
            "exp": int(time.time()) + 3600,
        },
        "test-secret-padded-32-bytes-hs256-ok",
        algorithm="HS256",
    )
    init = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "test", "version": "1"},
        },
    }
    with TestClient(configured_app) as client:  # runs lifespan (startup/shutdown)
        r = client.post(
            "/mcp",
            json=init,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/json, text/event-stream",
            },
        )

    # 200 = fully wired: token authenticated, session manager up, and the
    # transport-security Host check passed (a 421 here means DNS-rebinding
    # protection rejected the Host — see server.py).
    assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
    assert "Task group is not initialized" not in r.text
