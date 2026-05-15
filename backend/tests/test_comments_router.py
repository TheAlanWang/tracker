from unittest.mock import patch

from app.schemas.comment import CommentResponse


def _c(**over):
    base = dict(
        id="c-1", issue_id="i-1", author_id="u-1", body="hello",
        created_at="2026-05-14T00:00:00Z", updated_at="2026-05-14T00:00:00Z",
    )
    base.update(over)
    return CommentResponse(**base)


def test_list_comments_200(client, make_token):
    with patch("app.routers.comments.list_comments", return_value=[_c()]):
        token = make_token(sub="u-1")
        r = client.get("/issues/i-1/comments", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert len(r.json()) == 1


def test_list_comments_404(client, make_token):
    from app.services.comments import IssueNotFoundError
    with patch("app.routers.comments.list_comments", side_effect=IssueNotFoundError("i-1")):
        token = make_token(sub="u-1")
        r = client.get("/issues/missing/comments", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 404


def test_create_comment_201(client, make_token):
    with patch("app.routers.comments.create_comment", return_value=_c(body="new")):
        token = make_token(sub="u-1")
        r = client.post(
            "/issues/i-1/comments",
            json={"body": "new"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 201


def test_patch_comment_403_non_author(client, make_token):
    from app.services.comments import CommentPermissionError
    with patch("app.routers.comments.update_comment", side_effect=CommentPermissionError("c-1")):
        token = make_token(sub="other")
        r = client.patch(
            "/comments/c-1",
            json={"body": "x"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 403


def test_delete_comment_204(client, make_token):
    with patch("app.routers.comments.delete_comment", return_value=None):
        token = make_token(sub="u-1")
        r = client.delete("/comments/c-1", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 204
