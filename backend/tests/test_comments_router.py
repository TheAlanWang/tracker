from unittest.mock import patch

from app.schemas.comment import CommentResponse


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
