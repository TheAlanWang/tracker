"""Archive over MCP — update_task's `archived` flag and list_tasks' filter.

Archiving rides the generic task PATCH (`archived: bool` → the backend
stamps/clears archived_at server-side), same contract the web Archive
tab uses. No dedicated endpoint.
"""

import json
from unittest.mock import AsyncMock, patch

import httpx
import pytest
import respx

from trackly_mcp.client import TrackerClient, TracklyError
from trackly_mcp.context import CURRENT_BEARER, CURRENT_USER_ID, set_request_context
from trackly_mcp.server import list_tasks, update_task


@pytest.fixture
def client():
    return TrackerClient(api_url="https://tracker.test")


@pytest.fixture
def ctx():
    tokens = set_request_context(bearer="b", user_id="u-1")
    yield
    CURRENT_BEARER.reset(tokens.bearer)
    CURRENT_USER_ID.reset(tokens.user_id)


def _patch_task_resolution(client):
    return (
        patch("trackly_mcp.server.get_client", return_value=client),
        patch(
            "trackly_mcp.server.resolve_task_identifier",
            new=AsyncMock(return_value={"task_id": "t-1"}),
        ),
    )


@respx.mock
async def test_update_task_archived_true_sends_flag(client, ctx):
    route = respx.patch("https://tracker.test/tasks/t-1").mock(
        return_value=httpx.Response(
            200, json={"id": "t-1", "archived_at": "2026-07-15T00:00:00Z"}
        )
    )
    p1, p2 = _patch_task_resolution(client)
    with p1, p2:
        await update_task("TRAC-7", archived=True)
    assert json.loads(route.calls.last.request.content) == {"archived": True}


@respx.mock
async def test_update_task_archived_false_unarchives(client, ctx):
    route = respx.patch("https://tracker.test/tasks/t-1").mock(
        return_value=httpx.Response(200, json={"id": "t-1", "archived_at": None})
    )
    p1, p2 = _patch_task_resolution(client)
    with p1, p2:
        await update_task("TRAC-7", archived=False)
    assert json.loads(route.calls.last.request.content) == {"archived": False}


@respx.mock
async def test_update_task_omitting_archived_leaves_it_out(client, ctx):
    route = respx.patch("https://tracker.test/tasks/t-1").mock(
        return_value=httpx.Response(200, json={"id": "t-1"})
    )
    p1, p2 = _patch_task_resolution(client)
    with p1, p2:
        await update_task("TRAC-7", status="done")
    assert json.loads(route.calls.last.request.content) == {"status": "done"}


@respx.mock
async def test_update_task_archived_alone_is_a_valid_edit(client, ctx):
    """`archived` must count as a field for the no-op guard."""
    respx.patch("https://tracker.test/tasks/t-1").mock(
        return_value=httpx.Response(200, json={"id": "t-1"})
    )
    p1, p2 = _patch_task_resolution(client)
    with p1, p2:
        # Must not raise the "no fields to change" TracklyError.
        await update_task("TRAC-7", archived=True)


@respx.mock
async def test_list_tasks_archived_passes_query_param(client, ctx):
    route = respx.get("https://tracker.test/projects/p-1/tasks").mock(
        return_value=httpx.Response(200, json=[])
    )
    with (
        patch("trackly_mcp.server.get_client", return_value=client),
        patch(
            "trackly_mcp.server.resolve_workspace",
            new=AsyncMock(return_value={"id": "ws-1", "slug": "acme"}),
        ),
        patch(
            "trackly_mcp.server.resolve_project_key",
            new=AsyncMock(return_value={"id": "p-1"}),
        ),
    ):
        await list_tasks("acme", project_key="FRO", archived=True)
    assert route.calls.last.request.url.params["archived"] == "true"


async def test_list_tasks_archived_requires_project_key(ctx):
    """The workspace-wide endpoint has no archived filter — fail loudly
    instead of silently returning active tasks."""
    with pytest.raises(TracklyError, match="project_key"):
        await list_tasks("acme", archived=True)
