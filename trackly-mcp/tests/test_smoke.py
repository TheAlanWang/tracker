"""Smoke tests — verify the pieces wire up without hitting the network.

End-to-end is covered by manually pointing a Claude Code session at
the running server (see README); these tests catch the dumb stuff:
JWT shape, env handling, client init.
"""

import time

import jwt
import pytest

from trackly_mcp.auth import mint_user_jwt
from trackly_mcp.client import TrackerClient, get_client


def test_mint_user_jwt_shape():
    """Token decodes back with the same claims, in the Supabase user-session shape."""
    secret = "test-secret-padded-for-hs256-checks-32b"
    token = mint_user_jwt("user-abc", secret, ttl_seconds=60)
    decoded = jwt.decode(token, secret, algorithms=["HS256"], audience="authenticated")
    assert decoded["sub"] == "user-abc"
    assert decoded["aud"] == "authenticated"
    assert decoded["exp"] > time.time()


def test_get_client_requires_env(monkeypatch):
    """Missing env should fail loud, not silently produce a broken client."""
    monkeypatch.delenv("TRACKLY_USER_ID", raising=False)
    monkeypatch.delenv("TRACKLY_JWT_SECRET", raising=False)
    # Bust the lru_cache so a previous test's value doesn't leak in.
    get_client.cache_clear()
    with pytest.raises(RuntimeError, match="TRACKLY_USER_ID"):
        get_client()


def test_client_builds_auth_header():
    """A fresh JWT is minted on every call (no token cache to go stale)."""
    secret = "test-secret-padded-for-hs256-checks-32b"
    c = TrackerClient(api_url="https://example.test", user_id="u1", jwt_secret=secret)
    h1 = c._auth_header()
    time.sleep(1)
    h2 = c._auth_header()
    assert h1["Authorization"].startswith("Bearer ")
    # Tokens minted 1s apart should differ (iat differs by ≥1).
    assert h1["Authorization"] != h2["Authorization"]
