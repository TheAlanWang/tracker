"""Tests for the stale-session FK-violation → 401 exception handler in main.py.

When supabase db reset wipes auth.users, a user's JWT is still cryptographically
valid. Any INSERT carrying a FK into auth.users raises Postgres error 23503 with
details like 'Key (owner_id)=(...) is not present in table "users".' The global
exception handler in main.py should translate these into 401 so the frontend's
axios interceptor bounces the user to /login.
"""

from unittest.mock import patch

from postgrest.exceptions import APIError


async def test_create_workspace_stale_user_returns_401(client, make_token):
    """Stale JWT (auth.users wiped) → FK 23503 → translated to 401."""
    fk_error = APIError({
        "code": "23503",
        "message": "insert or update on table \"workspaces\" violates foreign key constraint \"workspaces_owner_id_fkey\"",
        "details": "Key (owner_id)=(deadbeef-dead-dead-dead-deaddeadbeef) is not present in table \"users\".",
        "hint": None,
    })
    with patch(
        "app.routers.workspaces.create_workspace",
        side_effect=fk_error,
    ):
        token = make_token(sub="deadbeef-dead-dead-dead-deaddeadbeef")
        response = client.post(
            "/workspaces",
            json={"name": "X", "slug": "x-test"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 401
        assert "no longer exists" in response.json()["detail"].lower()


async def test_unrelated_apierror_still_500(make_token):
    """Other APIErrors (e.g. missing relation) should NOT be translated to 401.

    FastAPI's TestClient re-raises unhandled server exceptions by default.
    Disable that so we can inspect the 500 HTTP response instead.
    """
    from fastapi.testclient import TestClient
    from app.main import app

    other_error = APIError({
        "code": "42P01",
        "message": "relation \"foo\" does not exist",
        "details": None,
        "hint": None,
    })
    with patch(
        "app.routers.workspaces.create_workspace",
        side_effect=other_error,
    ):
        token = make_token(sub="user-1")
        # raise_server_exceptions=False → re-raised exceptions become 500 responses
        with TestClient(app, raise_server_exceptions=False) as no_raise_client:
            response = no_raise_client.post(
                "/workspaces",
                json={"name": "X", "slug": "x-test"},
                headers={"Authorization": f"Bearer {token}"},
            )
        assert response.status_code == 500
