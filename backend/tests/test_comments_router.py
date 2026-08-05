from unittest.mock import patch

from app.schemas.comment import CommentPage, CommentResponse


def _c(**over):
    base = dict(
        id="c-1", task_id="i-1", author_id="u-1", body="hello",
        created_at="2026-05-14T00:00:00Z", updated_at="2026-05-14T00:00:00Z",
    )
    base.update(over)
    return CommentResponse(**base)


async def test_list_comments_200(client, make_token):
    with patch("app.routers.comments.list_comments", return_value=[_c()]):
        token = make_token(sub="u-1")
        r = client.get("/tasks/i-1/comments", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert len(r.json()) == 1


async def test_list_no_params_stays_bare_array(client, make_token):
    with patch("app.routers.comments.list_comments", return_value=[_c()]):
        token = make_token(sub="u-1")
        r = client.get("/tasks/i-1/comments", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert isinstance(r.json(), list)


async def test_list_with_limit_returns_envelope(client, make_token):
    page = CommentPage(items=[_c()], total=31, next_cursor="abc")
    with patch("app.routers.comments.list_comments_page", return_value=page) as m:
        token = make_token(sub="u-1")
        r = client.get(
            "/tasks/i-1/comments?limit=10&order=newest",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["total"] == 31
        assert body["next_cursor"] == "abc"
        assert len(body["items"]) == 1
        assert m.call_args.kwargs["limit"] == 10
        assert m.call_args.kwargs["order"] == "newest"


async def test_cursor_without_limit_422(client, make_token):
    token = make_token(sub="u-1")
    r = client.get(
        "/tasks/i-1/comments?cursor=abc",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 422


async def test_invalid_cursor_422(client, make_token):
    from app.services.comments import InvalidCursorError
    with patch("app.routers.comments.list_comments_page", side_effect=InvalidCursorError("x")):
        token = make_token(sub="u-1")
        r = client.get(
            "/tasks/i-1/comments?limit=10&cursor=garbage",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 422


async def test_limit_out_of_bounds_422(client, make_token):
    token = make_token(sub="u-1")
    r = client.get(
        "/tasks/i-1/comments?limit=101",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 422


async def test_create_comment_201(client, make_token):
    with patch("app.routers.comments.create_comment", return_value=_c(body="new")):
        token = make_token(sub="u-1")
        r = client.post(
            "/tasks/i-1/comments",
            json={"body": "new"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 201


async def test_patch_comment_403_non_author(client, make_token):
    from app.services.comments import CommentPermissionError
    with patch("app.routers.comments.update_comment", side_effect=CommentPermissionError("c-1")):
        token = make_token(sub="other")
        r = client.patch(
            "/comments/c-1",
            json={"body": "x"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 403
