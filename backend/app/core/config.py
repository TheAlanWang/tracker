import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# Which dotenv file to load. Defaults to .env.dev for local development;
# set APP_ENV=prd to point at hosted Supabase via .env.prd. In Railway /
# Vercel / other PaaS, vars are injected directly into the process so
# the file lookup just no-ops (BaseSettings reads env vars first).
APP_ENV = os.getenv("APP_ENV", "dev")


class Settings(BaseSettings):
    supabase_url: str
    supabase_anon_key: str
    supabase_service_key: str
    supabase_jwt_secret: str

    api_host: str = "127.0.0.1"
    api_port: int = 8000

    model_config = SettingsConfigDict(
        env_file=f".env.{APP_ENV}",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
