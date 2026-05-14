from app.core.config import Settings


def test_settings_load_from_env(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "http://test:54321")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon123")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "service123")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "secret123")

    settings = Settings()

    assert settings.supabase_url == "http://test:54321"
    assert settings.supabase_anon_key == "anon123"
    assert settings.supabase_service_key == "service123"
    assert settings.supabase_jwt_secret == "secret123"
