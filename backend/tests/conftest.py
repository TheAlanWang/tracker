import time

import jwt
import pytest
from fastapi.testclient import TestClient

from app.main import app

TEST_JWT_SECRET = "test-secret-key-padded-for-tests"


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    """Auto-applied: makes Settings load test values for every test."""
    monkeypatch.setenv("SUPABASE_URL", "http://test:54321")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon-test")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "service-test")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_JWT_SECRET)
    # clear cached settings so each test re-reads env
    from app.core.config import get_settings
    from app.db.supabase import get_supabase_admin
    get_settings.cache_clear()
    get_supabase_admin.cache_clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def make_token():
    def _make(sub: str = "user-123", exp_offset: int = 3600, **extra) -> str:
        payload = {
            "sub": sub,
            "exp": int(time.time()) + exp_offset,
            "iat": int(time.time()),
            "aud": "authenticated",
            **extra,
        }
        return jwt.encode(payload, TEST_JWT_SECRET, algorithm="HS256")

    return _make
