"""search_comments — in-memory keyword filter over a task's full comment
history. No backend change: this reuses the existing bare-list response
`GET /tasks/{id}/comments` already returns when `limit` is omitted.
"""

from unittest.mock import AsyncMock, patch

import httpx
import pytest
import respx

from trackly_mcp.client import TrackerClient
from trackly_mcp.context import CURRENT_BEARER, CURRENT_USER_ID, set_request_context
from trackly_mcp.server import search_comments


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


def _comment(id_, body, created_at):
    return {
        "id": id_,
        "task_id": "t-1",
        "author_id": "u-1",
        "body": body,
        "created_at": created_at,
        "updated_at": created_at,
    }


@respx.mock
async def test_search_comments_calls_bare_list_endpoint(client, ctx):
    """No `limit` param — must hit the non-paginated backend path, not the
    keyset-paginated one, since we need every comment to filter over."""
    route = respx.get("https://tracker.test/tasks/t-1/comments").mock(
        return_value=httpx.Response(200, json=[])
    )
    p1, p2 = _patch_task_resolution(client)
    with p1, p2:
        await search_comments("TRAC-7", "anything")
    assert route.calls.last.request.url.params == httpx.QueryParams()


@respx.mock
async def test_search_comments_matches_case_insensitively(client, ctx):
    respx.get("https://tracker.test/tasks/t-1/comments").mock(
        return_value=httpx.Response(
            200,
            json=[
                _comment("c-1", "Graded #84 already, looks fine.", "2026-08-01T00:00:00Z"),
                _comment("c-2", "Unrelated note.", "2026-08-02T00:00:00Z"),
            ],
        )
    )
    p1, p2 = _patch_task_resolution(client)
    with p1, p2:
        result = await search_comments("TRAC-7", "GRADED")
    assert result["total_matches"] == 1
    assert result["matches"][0]["id"] == "c-1"


@respx.mock
async def test_search_comments_snippet_is_truncated_with_context(client, ctx):
    body = "x" * 100 + "NEEDLE" + "y" * 100
    respx.get("https://tracker.test/tasks/t-1/comments").mock(
        return_value=httpx.Response(
            200, json=[_comment("c-1", body, "2026-08-01T00:00:00Z")]
        )
    )
    p1, p2 = _patch_task_resolution(client)
    with p1, p2:
        result = await search_comments("TRAC-7", "needle")
    snippet = result["matches"][0]["snippet"]
    assert snippet.startswith("...")
    assert snippet.endswith("...")
    assert "NEEDLE" in snippet
    assert len(snippet) < len(body)


@respx.mock
async def test_search_comments_no_match_returns_empty(client, ctx):
    respx.get("https://tracker.test/tasks/t-1/comments").mock(
        return_value=httpx.Response(
            200, json=[_comment("c-1", "nothing relevant here", "2026-08-01T00:00:00Z")]
        )
    )
    p1, p2 = _patch_task_resolution(client)
    with p1, p2:
        result = await search_comments("TRAC-7", "needle")
    assert result == {"matches": [], "total_matches": 0}


@respx.mock
async def test_search_comments_blank_query_short_circuits(client, ctx):
    route = respx.get("https://tracker.test/tasks/t-1/comments").mock(
        return_value=httpx.Response(200, json=[])
    )
    p1, p2 = _patch_task_resolution(client)
    with p1, p2:
        result = await search_comments("TRAC-7", "   ")
    assert result == {"matches": [], "total_matches": 0}
    assert route.calls.call_count == 0


@respx.mock
async def test_search_comments_sorts_newest_first_and_caps_limit(client, ctx):
    comments = [
        _comment(f"c-{i}", "needle here", f"2026-08-{i:02d}T00:00:00Z")
        for i in range(1, 4)
    ]
    respx.get("https://tracker.test/tasks/t-1/comments").mock(
        return_value=httpx.Response(200, json=comments)
    )
    p1, p2 = _patch_task_resolution(client)
    with p1, p2:
        result = await search_comments("TRAC-7", "needle", limit=2)
    assert result["total_matches"] == 3
    assert [m["id"] for m in result["matches"]] == ["c-3", "c-2"]
