from unittest.mock import MagicMock

import pytest

from app.services.notifications import (
    NotificationNotFoundError,
    NotificationPermissionError,
    list_my_notifications,
    mark_all_read,
    mark_read,
)


def _notif_row(**over):
    base = {
        "id": "n-1",
        "user_id": "u-1",
        "type": "assigned",
        "task_id": "i-1",
        "actor_id": "u-2",
        "payload": {"identifier": "PROJ-1", "title": "Fix it"},
        "read_at": None,
        "created_at": "2026-05-14T00:00:00Z",
    }
    base.update(over)
    return base


@pytest.fixture
def mock_supabase():
    return MagicMock()


async def test_list_notifications_returns_all(mock_supabase):
    chain = MagicMock()
    chain.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = [
        _notif_row(),
        _notif_row(id="n-2", type="commented"),
    ]

    def table_router(name):
        if name == "notifications":
            return chain
        raise AssertionError(f"unexpected: {name}")

    mock_supabase.table.side_effect = table_router

    result = await list_my_notifications(mock_supabase, user_id="u-1")
    assert len(result) == 2
    assert result[0].id == "n-1"


async def test_list_notifications_unread_only_uses_is_filter(mock_supabase):
    chain = MagicMock()
    # unread_only=True: select→eq→order→is_→limit→execute
    chain.select.return_value.eq.return_value.order.return_value.is_.return_value.limit.return_value.execute.return_value.data = [
        _notif_row(),
    ]

    def table_router(name):
        if name == "notifications":
            return chain
        raise AssertionError(f"unexpected: {name}")

    mock_supabase.table.side_effect = table_router

    result = await list_my_notifications(mock_supabase, user_id="u-1", unread_only=True)
    assert len(result) == 1
    # Verify .is_ was called with read_at and "null"
    chain.select.return_value.eq.return_value.order.return_value.is_.assert_called_once_with(
        "read_at", "null"
    )


async def test_mark_read_wrong_user_raises(mock_supabase):
    chain = MagicMock()
    chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _notif_row(user_id="other")

    mock_supabase.table.side_effect = lambda name: chain

    with pytest.raises(NotificationPermissionError):
        await mark_read(mock_supabase, user_id="u-1", notification_id="n-1")


async def test_mark_all_read_returns_count(mock_supabase):
    chain = MagicMock()
    chain.update.return_value.eq.return_value.is_.return_value.execute.return_value.data = [
        _notif_row(read_at="2026-05-14T01:00:00Z"),
        _notif_row(id="n-2", read_at="2026-05-14T01:00:00Z"),
    ]

    mock_supabase.table.side_effect = lambda name: chain

    count = await mark_all_read(mock_supabase, user_id="u-1")
    assert count == 2
