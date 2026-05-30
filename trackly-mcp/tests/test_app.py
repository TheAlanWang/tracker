"""App-level smoke: /mcp is 401 without auth, OAuth endpoints are reachable, no env at import."""

import json
import time

import httpx
import jwt
import pytest
import respx


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


def _mint(secret="test-secret-padded-32-bytes-hs256-ok"):
    return jwt.encode(
        {"sub": "u1", "aud": "authenticated", "iat": int(time.time()), "exp": int(time.time()) + 3600},
        secret,
        algorithm="HS256",
    )


def _sse_json(r):
    for line in r.text.splitlines():
        if line.startswith("data:"):
            return json.loads(line[5:].strip())
    return r.json()


def test_authed_tool_call_forwards_bearer_to_backend(configured_app):
    """End-to-end: an authenticated tools/call must propagate the caller's
    bearer through the stateless transport + AuthMiddleware contextvar to the
    backend REST call. Guards two fixes at once: stateless_http (so the tool
    runs in the request context and get_bearer() works) and the Host check
    being off (no 421). If stateful, the tool would LookupError the bearer.
    """
    from starlette.testclient import TestClient

    token = _mint()
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json, text/event-stream",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-06-18",
    }
    init = {
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {"protocolVersion": "2025-06-18", "capabilities": {},
                   "clientInfo": {"name": "t", "version": "1"}},
    }
    call = {
        "jsonrpc": "2.0", "id": 2, "method": "tools/call",
        "params": {"name": "list_workspaces", "arguments": {}},
    }
    with respx.mock:
        route = respx.get("https://tracker.test/workspaces").mock(
            return_value=httpx.Response(200, json=[{"id": "w1", "slug": "acme", "name": "Acme"}])
        )
        with TestClient(configured_app) as c:  # runs lifespan
            ri = c.post("/mcp", json=init, headers=headers)
            r = c.post("/mcp", json=call, headers=headers)

        # initialize 200 = session manager wired (no "Task group not initialized"
        # 500) AND Host check passed (no 421 from DNS-rebinding protection).
        assert ri.status_code == 200, ri.text
        assert "Task group is not initialized" not in ri.text
        assert r.status_code == 200, r.text
        body = _sse_json(r)
        assert body["result"]["isError"] is False, body
        assert route.called, "tool did not reach the backend"
        assert route.calls.last.request.headers["authorization"] == f"Bearer {token}"
