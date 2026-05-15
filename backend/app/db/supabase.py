from functools import lru_cache

from supabase import Client, create_client

from app.core.config import get_settings


@lru_cache
def get_supabase_admin() -> Client:
    """Return a cached Supabase client authenticated as service_role.

    This client BYPASSES RLS — use carefully in service layer code that
    explicitly checks ownership.
    """
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_key)
