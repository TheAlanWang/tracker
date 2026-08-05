from unittest.mock import MagicMock

import pytest

from app.schemas.comment import CommentCreate, CommentUpdate
from app.services.comments import (
    CommentNotFoundError,
    CommentPermissionError,
    InvalidCursorError,
    TaskNotFoundError,
    _decode_cursor,
    _encode_cursor,
    create_comment,
    delete_comment,
    list_comments,
    list_comments_page,
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


# ---- pagination ----


def _page_chains(rows, count):
    """comments table mocks for list_comments_page: one chain for the head
    count query, one for the page query (with/without or_)."""
    count_chain = MagicMock()
    count_res = MagicMock()
    count_res.count = count
    count_chain.select.return_value.eq.return_value.execute.return_value = count_res

    page_chain = MagicMock()
    page_res = MagicMock()
    page_res.data = rows
    # without cursor: select().eq().order().order().limit().execute()
    page_chain.select.return_value.eq.return_value.order.return_value.order.return_value.limit.return_value.execute.return_value = page_res
    # with cursor: select().eq().or_().order().order().limit().execute()
    page_chain.select.return_value.eq.return_value.or_.return_value.order.return_value.order.return_value.limit.return_value.execute.return_value = page_res
    return count_chain, page_chain


def _wire(mock_supabase, count_chain, page_chain):
    tasks_chain = MagicMock()
    tasks_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _task_row()
    members_chain = MagicMock()
    members_chain.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"role": "member"}]

    call_count = {"comments": 0}
    def table_router(name):
        if name == "tasks": return tasks_chain
        if name == "workspace_members": return members_chain
        if name == "comments":
            call_count["comments"] += 1
            return count_chain if call_count["comments"] == 1 else page_chain
        raise AssertionError(f"unexpected: {name}")
    mock_supabase.table.side_effect = table_router


def test_cursor_roundtrip():
    cur = _encode_cursor("2026-08-04T12:00:00+00:00", "c-9")
    assert _decode_cursor(cur) == ("2026-08-04T12:00:00+00:00", "c-9")


def test_decode_invalid_cursor_raises():
    with pytest.raises(InvalidCursorError):
        _decode_cursor("not-base64!!")


async def test_page_has_more_sets_next_cursor(mock_supabase):
    # limit=2, service fetches limit+1=3 rows → has_more, items trimmed to 2,
    # next_cursor encodes the LAST RETURNED item (c-2), not the probe row.
    rows = [
        _comment_row(id="c-3", created_at="2026-08-04T03:00:00+00:00"),
        _comment_row(id="c-2", created_at="2026-08-04T02:00:00+00:00"),
        _comment_row(id="c-1", created_at="2026-08-04T01:00:00+00:00"),
    ]
    count_chain, page_chain = _page_chains(rows, count=5)
    _wire(mock_supabase, count_chain, page_chain)

    page = await list_comments_page(
        mock_supabase, user_id="u-1", task_id="i-1", limit=2
    )
    assert [c.id for c in page.items] == ["c-3", "c-2"]
    assert page.total == 5
    assert _decode_cursor(page.next_cursor) == ("2026-08-04T02:00:00+00:00", "c-2")
    # newest → descending on the first keyset column
    page_chain.select.return_value.eq.return_value.order.assert_called_with(
        "created_at", desc=True
    )


async def test_last_page_has_null_cursor(mock_supabase):
    rows = [_comment_row(id="c-1")]
    count_chain, page_chain = _page_chains(rows, count=3)
    _wire(mock_supabase, count_chain, page_chain)

    page = await list_comments_page(
        mock_supabase, user_id="u-1", task_id="i-1", limit=2
    )
    assert page.next_cursor is None
    assert len(page.items) == 1


async def test_cursor_builds_tuple_filter(mock_supabase):
    cur = _encode_cursor("2026-08-04T02:00:00+00:00", "c-2")
    count_chain, page_chain = _page_chains([], count=0)
    _wire(mock_supabase, count_chain, page_chain)

    await list_comments_page(
        mock_supabase, user_id="u-1", task_id="i-1", limit=2, cursor=cur
    )
    or_arg = page_chain.select.return_value.eq.return_value.or_.call_args[0][0]
    assert or_arg == (
        'created_at.lt."2026-08-04T02:00:00+00:00",'
        'and(created_at.eq."2026-08-04T02:00:00+00:00",id.lt."c-2")'
    )


async def test_oldest_order_flips_direction(mock_supabase):
    cur = _encode_cursor("2026-08-04T02:00:00+00:00", "c-2")
    count_chain, page_chain = _page_chains([], count=0)
    _wire(mock_supabase, count_chain, page_chain)

    await list_comments_page(
        mock_supabase, user_id="u-1", task_id="i-1", limit=2,
        cursor=cur, order="oldest",
    )
    or_arg = page_chain.select.return_value.eq.return_value.or_.call_args[0][0]
    assert "created_at.gt." in or_arg and "id.gt." in or_arg
    page_chain.select.return_value.eq.return_value.or_.return_value.order.assert_called_with(
        "created_at", desc=False
    )


async def test_delete_comment_author_only(mock_supabase):
    comments_chain = MagicMock()
    comments_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _comment_row(author_id="other")

    def table_router(name):
        if name == "comments": return comments_chain
        raise AssertionError(f"unexpected: {name}")
    mock_supabase.table.side_effect = table_router

    with pytest.raises(CommentPermissionError):
        await delete_comment(mock_supabase, user_id="u-1", comment_id="c-1")
