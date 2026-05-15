from app.db.supabase import get_supabase_admin


def test_get_supabase_admin_returns_cached_client():
    client1 = get_supabase_admin()
    client2 = get_supabase_admin()
    assert client1 is client2  # cached


def test_get_supabase_admin_uses_service_key(monkeypatch):
    # Reset cache to pick up new env
    get_supabase_admin.cache_clear()
    monkeypatch.setenv("SUPABASE_URL", "http://other:54321")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "different-service-key")
    from app.core.config import get_settings
    get_settings.cache_clear()

    client = get_supabase_admin()
    assert client.supabase_key == "different-service-key"
