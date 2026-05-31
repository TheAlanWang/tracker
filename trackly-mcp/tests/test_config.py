"""Config loader: every required env var fails loud, no defaults that hide bugs."""

import pytest

from trackly_mcp.config import Config, load_config


REQUIRED = {
    "SUPABASE_URL": "https://test.supabase.co",
    "SUPABASE_JWT_SECRET": "secret-padded-32-bytes-for-hs256-ok",
    "SUPABASE_ANON_KEY": "anon-key",
    "TRACKLY_API_URL": "https://tracker.test",
    "SERVER_BASE_URL": "https://mcp.test",
    "WEB_URL": "https://app.test",
}


def test_load_config_all_present(monkeypatch):
    for k, v in REQUIRED.items():
        monkeypatch.setenv(k, v)
    cfg = load_config()
    assert isinstance(cfg, Config)
    assert cfg.supabase_url == "https://test.supabase.co"
    assert cfg.supabase_jwt_secret == "secret-padded-32-bytes-for-hs256-ok"
    assert cfg.supabase_anon_key == "anon-key"
    assert cfg.trackly_api_url == "https://tracker.test"
    assert cfg.server_base_url == "https://mcp.test"
    assert cfg.web_url == "https://app.test"


@pytest.mark.parametrize("missing", list(REQUIRED.keys()))
def test_load_config_missing_var_raises(monkeypatch, missing):
    for k, v in REQUIRED.items():
        monkeypatch.setenv(k, v)
    monkeypatch.delenv(missing, raising=False)
    with pytest.raises(RuntimeError, match=missing):
        load_config()


def test_config_trims_trailing_slashes(monkeypatch):
    for k, v in REQUIRED.items():
        monkeypatch.setenv(k, v)
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co/")
    monkeypatch.setenv("TRACKLY_API_URL", "https://tracker.test/")
    monkeypatch.setenv("SERVER_BASE_URL", "https://mcp.test/")
    cfg = load_config()
    assert cfg.supabase_url == "https://test.supabase.co"
    assert cfg.trackly_api_url == "https://tracker.test"
    assert cfg.server_base_url == "https://mcp.test"
    assert cfg.web_url == "https://app.test"
