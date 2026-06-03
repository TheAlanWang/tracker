"""Router tests for /resolve — patch the service (matches other router tests)."""

from unittest.mock import patch

from app.services.resolve import ResolveResponse

_RESP = ResolveResponse(
    workspace_slug="team-b", project_key="RAG", task_id="task-b", identifier="RAG-10"
)


async def test_resolve_scoped_200(client, make_token):
    with patch("app.routers.resolve.resolve_scoped", return_value=_RESP):
        token = make_token(sub="u-1")
        response = client.get(
            "/resolve/scoped/team-b/RAG/RAG-10",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        assert response.json()["task_id"] == "task-b"


async def test_resolve_scoped_404(client, make_token):
    from fastapi import HTTPException

    with patch(
        "app.routers.resolve.resolve_scoped",
        side_effect=HTTPException(status_code=404),
    ):
        token = make_token(sub="u-1")
        response = client.get(
            "/resolve/scoped/team-b/RAG/RAG-10",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 404


async def test_resolve_scoped_unauthenticated_rejected(client):
    response = client.get("/resolve/scoped/team-b/RAG/RAG-10")
    assert response.status_code in (401, 403)


async def test_resolve_identifier_passes_prefer_workspace(client, make_token):
    with patch(
        "app.routers.resolve.resolve_identifier", return_value=_RESP
    ) as m:
        token = make_token(sub="u-1")
        response = client.get(
            "/resolve/identifier/RAG-10?prefer_workspace=team-b",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        assert m.await_args.kwargs["prefer_workspace"] == "team-b"


async def test_resolve_identifier_no_hint_passes_none(client, make_token):
    with patch(
        "app.routers.resolve.resolve_identifier", return_value=_RESP
    ) as m:
        token = make_token(sub="u-1")
        response = client.get(
            "/resolve/identifier/RAG-10",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        assert m.await_args.kwargs["prefer_workspace"] is None
