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
