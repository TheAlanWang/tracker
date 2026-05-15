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
        "issue_id": "i-1",
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


# ─── list_my_notifications ───


def test_list_notifications_returns_all(mock_supabase):
    chain = MagicMock()
    # no unread filter: select→eq→order→limit→execute
    chain.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = [
        _notif_row(),
        _notif_row(id="n-2", type="commented"),
    ]

    def table_router(name):
        if name == "notifications":
            return chain
        raise AssertionError(f"unexpected: {name}")

    mock_supabase.table.side_effect = table_router

    result = list_my_notifications(mock_supabase, user_id="u-1")
    assert len(result) == 2
    assert result[0].id == "n-1"


def test_list_notifications_unread_only_uses_is_filter(mock_supabase):
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

    result = list_my_notifications(mock_supabase, user_id="u-1", unread_only=True)
    assert len(result) == 1
    # Verify .is_ was called with read_at and "null"
    chain.select.return_value.eq.return_value.order.return_value.is_.assert_called_once_with(
        "read_at", "null"
    )


# ─── mark_read ───


def test_mark_read_happy_path(mock_supabase):
    fetch_chain = MagicMock()
    fetch_chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _notif_row()
    update_chain = MagicMock()
    update_chain.update.return_value.eq.return_value.execute.return_value.data = [
        _notif_row(read_at="2026-05-14T01:00:00Z")
    ]

    call_count = {"notifications": 0}

    def table_router(name):
        if name == "notifications":
            call_count["notifications"] += 1
            return fetch_chain if call_count["notifications"] == 1 else update_chain
        raise AssertionError(f"unexpected: {name}")

    mock_supabase.table.side_effect = table_router

    # Should not raise
    mark_read(mock_supabase, user_id="u-1", notification_id="n-1")


def test_mark_read_not_found_raises(mock_supabase):
    chain = MagicMock()
    chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = None

    mock_supabase.table.side_effect = lambda name: chain

    with pytest.raises(NotificationNotFoundError):
        mark_read(mock_supabase, user_id="u-1", notification_id="missing")


def test_mark_read_wrong_user_raises(mock_supabase):
    chain = MagicMock()
    chain.select.return_value.eq.return_value.single.return_value.execute.return_value.data = _notif_row(user_id="other")

    mock_supabase.table.side_effect = lambda name: chain

    with pytest.raises(NotificationPermissionError):
        mark_read(mock_supabase, user_id="u-1", notification_id="n-1")


# ─── mark_all_read ───


def test_mark_all_read_returns_count(mock_supabase):
    chain = MagicMock()
    chain.update.return_value.eq.return_value.is_.return_value.execute.return_value.data = [
        _notif_row(read_at="2026-05-14T01:00:00Z"),
        _notif_row(id="n-2", read_at="2026-05-14T01:00:00Z"),
    ]

    mock_supabase.table.side_effect = lambda name: chain

    count = mark_all_read(mock_supabase, user_id="u-1")
    assert count == 2
