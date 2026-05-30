"""Contextvars: per-request bearer + user_id, isolated across async tasks."""

import asyncio

import pytest

from trackly_mcp.context import (
    CURRENT_BEARER,
    CURRENT_USER_ID,
    get_bearer,
    get_user_id,
    set_request_context,
)


def test_get_bearer_unset_raises():
    with pytest.raises(LookupError):
        get_bearer()


def test_get_user_id_unset_raises():
    with pytest.raises(LookupError):
        get_user_id()


def test_set_request_context_sets_both():
    token = set_request_context(bearer="abc", user_id="u-1")
    try:
        assert get_bearer() == "abc"
        assert get_user_id() == "u-1"
    finally:
        CURRENT_BEARER.reset(token.bearer)
        CURRENT_USER_ID.reset(token.user_id)


async def test_contextvars_isolated_across_tasks():
    """Two parallel coroutines must see distinct bearers (no cross-leak)."""
    seen = {}

    async def worker(name: str, bearer: str):
        tok = set_request_context(bearer=bearer, user_id=f"u-{name}")
        try:
            await asyncio.sleep(0.01)
            seen[name] = get_bearer()
        finally:
            CURRENT_BEARER.reset(tok.bearer)
            CURRENT_USER_ID.reset(tok.user_id)

    await asyncio.gather(worker("a", "tok-A"), worker("b", "tok-B"))
    assert seen == {"a": "tok-A", "b": "tok-B"}
