"""resolve_task_identifier: strict scoped resolve when a workspace is given,
bare cross-workspace resolve otherwise.

A bare identifier like RAG-10 isn't unique across workspaces. When the caller
knows the workspace, we hit /resolve/scoped (deriving the project key from the
identifier prefix) so exactly one task is targeted; otherwise we fall back to
the bare /resolve/identifier endpoint.
"""

import httpx
import pytest
import respx

from trackly_mcp.client import init_client, resolve_task_identifier
from trackly_mcp.context import CURRENT_BEARER, CURRENT_USER_ID, set_request_context


@pytest.fixture(autouse=True)
def _client_and_context():
    init_client(api_url="https://tracker.test")
    tokens = set_request_context(bearer="b", user_id="u")
    try:
        yield
    finally:
        CURRENT_BEARER.reset(tokens.bearer)
        CURRENT_USER_ID.reset(tokens.user_id)


@respx.mock
async def test_with_workspace_uses_scoped_endpoint():
    route = respx.get(
        "https://tracker.test/resolve/scoped/team-b/RAG/RAG-10"
    ).mock(return_value=httpx.Response(200, json={"task_id": "task-b"}))
    result = await resolve_task_identifier("RAG-10", "team-b")
    assert route.called
    assert result == {"task_id": "task-b"}


@respx.mock
async def test_without_workspace_uses_bare_endpoint():
    route = respx.get("https://tracker.test/resolve/identifier/RAG-10").mock(
        return_value=httpx.Response(200, json={"task_id": "task-oldest"})
    )
    result = await resolve_task_identifier("RAG-10")
    assert route.called
    assert result == {"task_id": "task-oldest"}


@respx.mock
async def test_scoped_404_surfaces_as_error():
    # Wrong workspace fails loud rather than touching another workspace's task.
    respx.get("https://tracker.test/resolve/scoped/team-a/RAG/RAG-10").mock(
        return_value=httpx.Response(404, json={"detail": "Not Found"})
    )
    with pytest.raises(Exception, match="404"):
        await resolve_task_identifier("RAG-10", "team-a")
