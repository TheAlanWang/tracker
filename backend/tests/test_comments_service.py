from unittest.mock import MagicMock

import pytest

from app.schemas.comment import CommentCreate, CommentUpdate
from app.services.comments import (
    CommentNotFoundError,
    CommentPermissionError,
    TaskNotFoundError,
    create_comment,
    delete_comment,
    list_comments,
    update_comment,
)


def _comment_row(**over):
    base = {
        "id": "c-1",
        "task_id": "i-1",
        "author_id": "u-1",
        "body": "hello",
        "created_at": "2026-05-14T00:00:00Z",
        "updated_at": "2026-05-14T00:00:00Z",
    }
    base.update(over)
    return base


def _task_row(**over):
    base = {"id": "i-1", "workspace_id": "ws-1", "project_id": "p-1"}
    base.update(over)
    return base


@pytest.fixture
def mock_supabase():
    return MagicMock()


async def test_list_comments_member_ok(mock_supabase):
    tasks_chain = MagicMock()
    tasks_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _task_row()
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"role": "member"}]
    comments_chain = MagicMock()
    comments_chain.select.return_value.eq.return_value.order.return_value.execute.return_value.data = [
        _comment_row(), _comment_row(id="c-2", body="world")
    ]

    def table_router(name):
        if name == "tasks": return tasks_chain
        if name == "workspace_members": return members_chain
        if name == "comments": return comments_chain
        raise AssertionError(f"unexpected: {name}")
    mock_supabase.table.side_effect = table_router

    result = await list_comments(mock_supabase, user_id="u-1", task_id="i-1")
    assert len(result) == 2


async def test_create_comment_inserts_with_author(mock_supabase):
    tasks_chain = MagicMock()
    tasks_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _task_row()
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"role": "member"}]
    comments_chain = MagicMock()
    comments_chain.insert.return_value.execute.return_value.data = [_comment_row(body="new")]

    def table_router(name):
        if name == "tasks": return tasks_chain
        if name == "workspace_members": return members_chain
        if name == "comments": return comments_chain
        raise AssertionError(f"unexpected: {name}")
    mock_supabase.table.side_effect = table_router

    result = await create_comment(
        mock_supabase, user_id="u-1", task_id="i-1",
        payload=CommentCreate(body="new"),
    )
    assert result.body == "new"
    insert_args = comments_chain.insert.call_args[0][0]
    assert insert_args == {
        "task_id": "i-1",
        "author_id": "u-1",
        "body": "new",
    }


async def test_update_comment_happy_path(mock_supabase):
    comments_chain_fetch = MagicMock()
    comments_chain_fetch.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _comment_row()
    comments_chain_update = MagicMock()
    comments_chain_update.update.return_value.eq.return_value.execute.return_value.data = [_comment_row(body="updated")]

    call_count = {"comments": 0}
    def table_router(name):
        if name == "comments":
            call_count["comments"] += 1
            return comments_chain_fetch if call_count["comments"] == 1 else comments_chain_update
        raise AssertionError(f"unexpected: {name}")
    mock_supabase.table.side_effect = table_router

    result = await update_comment(
        mock_supabase, user_id="u-1", comment_id="c-1",
        payload=CommentUpdate(body="updated"),
    )
    assert result.body == "updated"


async def test_delete_comment_author_only(mock_supabase):
    comments_chain = MagicMock()
    comments_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _comment_row(author_id="other")

    def table_router(name):
        if name == "comments": return comments_chain
        raise AssertionError(f"unexpected: {name}")
    mock_supabase.table.side_effect = table_router

    with pytest.raises(CommentPermissionError):
        await delete_comment(mock_supabase, user_id="u-1", comment_id="c-1")
