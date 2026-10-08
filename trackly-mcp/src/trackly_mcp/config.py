"""Environment configuration. Fail loud on missing values, no defaults that hide bugs.

This is the only place that reads `SUPABASE_JWT_SECRET` (per security invariant #1).
Anywhere else in the codebase grepping for `SUPABASE_JWT_SECRET` should be a bug.
"""

import os
from dataclasses import dataclass

_REQUIRED = (
    "SUPABASE_URL",
    "SUPABASE_JWT_SECRET",
    "SUPABASE_ANON_KEY",
    "TRACKLY_API_URL",
    "SERVER_BASE_URL",
    "WEB_URL",
)


@dataclass(frozen=True)
class Config:
    supabase_url: str
    supabase_jwt_secret: str
    supabase_anon_key: str
    trackly_api_url: str
    server_base_url: str
    # Frontend origin used to build human-facing task links (e.g.
    # https://gettrackly.dev/browse/TRAC-7). Kept in env so a domain change
    # is a config edit, not a code change.
    web_url: str
    # Optional. When set, the picker's "Continue with Google" runs the direct
    # Google code flow (oauth/google.py) instead of Supabase's hosted redirect,
    # whose supabase.co callback is no longer registered on the Google client.
    google_client_id: str = ""
    google_client_secret: str = ""


def public_web_url() -> str:
    """Frontend origin for public assets (logos), safe to call at import time.

    Unlike load_config() this doesn't fail on a missing env: it's used for
    cosmetic URLs (server icon, picker logo) where a default is harmless.
    """
    return os.environ.get("WEB_URL", "https://gettrackly.dev").rstrip("/")


def load_config() -> Config:
    missing = [name for name in _REQUIRED if not os.environ.get(name)]
    if missing:
        raise RuntimeError(
            f"Missing required env vars: {', '.join(missing)}. "
            f"Set them as Railway service variables (production) or in `.env` (local dev)."
        )
    return Config(
        supabase_url=os.environ["SUPABASE_URL"].rstrip("/"),
        supabase_jwt_secret=os.environ["SUPABASE_JWT_SECRET"],
        supabase_anon_key=os.environ["SUPABASE_ANON_KEY"],
        trackly_api_url=os.environ["TRACKLY_API_URL"].rstrip("/"),
        server_base_url=os.environ["SERVER_BASE_URL"].rstrip("/"),
        web_url=os.environ["WEB_URL"].rstrip("/"),
        google_client_id=os.environ.get("GOOGLE_CLIENT_ID", ""),
        google_client_secret=os.environ.get("GOOGLE_CLIENT_SECRET", ""),
    )
