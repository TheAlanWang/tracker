"""PKCE / authorization-code state dicts with 90-second TTL."""

import asyncio
import time

import pytest

from trackly_mcp.oauth.state import (
    AuthState,
    StateStore,
    SupabaseTokens,
)


@pytest.fixture
def store():
    return StateStore(ttl_seconds=2)  # short TTL for tests


def test_put_get_auth_state(store):
    s = AuthState(
        server_verifier="v-srv",
        client_challenge="c-chal",
        client_redirect_uri="http://127.0.0.1:1234/cb",
        client_state="c-state",
    )
    store.put_auth("state-1", s)
    got = store.pop_auth("state-1")
    assert got == s


def test_pop_auth_consumes(store):
    store.put_auth("s", AuthState("v", "c", "http://127.0.0.1:1/c", "x"))
    store.pop_auth("s")
    with pytest.raises(KeyError):
        store.pop_auth("s")


def test_pop_auth_missing_raises(store):
    with pytest.raises(KeyError):
        store.pop_auth("nope")


def test_put_get_tokens(store):
    t = SupabaseTokens(
        access_token="a",
        refresh_token="r",
        client_challenge="c",
    )
    store.put_tokens("code-1", t)
    got = store.pop_tokens("code-1")
    assert got == t


def test_pop_tokens_consumes(store):
    """Invariant #7: one-time use."""
    store.put_tokens(
        "c", SupabaseTokens(access_token="a", refresh_token="r", client_challenge="cc")
    )
    store.pop_tokens("c")
    with pytest.raises(KeyError):
        store.pop_tokens("c")


def test_expired_state_raises(monkeypatch, store):
    store.put_auth("s", AuthState("v", "c", "http://127.0.0.1:1/c", "x"))
    _real = time.monotonic
    monkeypatch.setattr(time, "monotonic", lambda: _real() + 10)
    with pytest.raises(KeyError):
        store.pop_auth("s")


def test_expired_tokens_raises(monkeypatch, store):
    store.put_tokens(
        "c", SupabaseTokens(access_token="a", refresh_token="r", client_challenge="cc")
    )
    _real = time.monotonic
    monkeypatch.setattr(time, "monotonic", lambda: _real() + 10)
    with pytest.raises(KeyError):
        store.pop_tokens("c")


async def test_sweeper_drops_expired_entries():
    store = StateStore(ttl_seconds=1)
    store.put_auth("s1", AuthState("v", "c", "http://127.0.0.1:1/c", "x"))
    store.put_tokens(
        "c1", SupabaseTokens(access_token="a", refresh_token="r", client_challenge="cc")
    )
    await asyncio.sleep(1.1)
    store.sweep()
    # entries should be gone — pop should raise KeyError, not return a stale value
    with pytest.raises(KeyError):
        store.pop_auth("s1")
    with pytest.raises(KeyError):
        store.pop_tokens("c1")
