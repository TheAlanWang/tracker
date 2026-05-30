"""client.py reads bearer from contextvar, forwards verbatim to Trackly API."""

import httpx
import pytest
import respx

from trackly_mcp.client import TrackerClient
from trackly_mcp.context import set_request_context, CURRENT_BEARER, CURRENT_USER_ID


@pytest.fixture
def client():
    return TrackerClient(api_url="https://tracker.test")


@respx.mock
async def test_get_forwards_bearer_from_context(client):
    route = respx.get("https://tracker.test/workspaces").mock(
        return_value=httpx.Response(200, json=[{"id": "ws-1"}])
    )
    tokens = set_request_context(bearer="user-bearer-xyz", user_id="u-1")
    try:
        result = await client.get("/workspaces")
    finally:
        CURRENT_BEARER.reset(tokens.bearer)
        CURRENT_USER_ID.reset(tokens.user_id)

    assert result == [{"id": "ws-1"}]
    assert route.calls.last.request.headers["authorization"] == "Bearer user-bearer-xyz"


@respx.mock
async def test_post_forwards_bearer(client):
    route = respx.post("https://tracker.test/projects/p/tasks").mock(
        return_value=httpx.Response(200, json={"id": "t-1"})
    )
    tokens = set_request_context(bearer="bearer-2", user_id="u-2")
    try:
        await client.post("/projects/p/tasks", json={"title": "x"})
    finally:
        CURRENT_BEARER.reset(tokens.bearer)
        CURRENT_USER_ID.reset(tokens.user_id)
    assert route.calls.last.request.headers["authorization"] == "Bearer bearer-2"


async def test_request_without_context_raises(client):
    """No bearer set = LookupError. Means the tool was somehow called without auth middleware."""
    with pytest.raises(LookupError):
        await client.get("/workspaces")


@respx.mock
async def test_4xx_surfaces_backend_detail(client):
    respx.get("https://tracker.test/tasks/missing").mock(
        return_value=httpx.Response(404, json={"detail": "Task not found"})
    )
    tokens = set_request_context(bearer="b", user_id="u")
    try:
        with pytest.raises(Exception, match="Task not found"):
            await client.get("/tasks/missing")
    finally:
        CURRENT_BEARER.reset(tokens.bearer)
        CURRENT_USER_ID.reset(tokens.user_id)
