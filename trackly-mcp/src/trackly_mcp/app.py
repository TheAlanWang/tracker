"""Top-level Starlette app: mounts FastMCP's streamable HTTP transport
under `/mcp`, mounts the OAuth router for `/authorize`, `/callback`,
`/token`, `/.well-known/*`. Wraps `/mcp` in the AuthMiddleware.

The factory shape (`create_app()`) keeps tests from triggering env-var
loading at import time.
"""

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from starlette.applications import Starlette

from .client import init_client
from .config import load_config
from .middleware import AuthMiddleware
from .oauth.routes import build_oauth_router
from .oauth.state import StateStore
from .oauth.supabase import SupabaseAuthClient
from .server import mcp


def create_app() -> Starlette:
    cfg = load_config()

    # Init the singleton REST client; tools call get_client() to fetch it.
    init_client(api_url=cfg.trackly_api_url)

    store = StateStore(ttl_seconds=90.0)
    supabase = SupabaseAuthClient(
        supabase_url=cfg.supabase_url,
        anon_key=cfg.supabase_anon_key,
    )
    oauth = build_oauth_router(
        store=store,
        supabase=supabase,
        server_base_url=cfg.server_base_url,
    )

    # FastMCP exposes its streamable-HTTP ASGI app via a method that varies by
    # version. As of mcp>=1.4, it's `mcp.streamable_http_app()`. The path we
    # want it served at is `/mcp` (with trailing-slash normalised).
    mcp_app = mcp.streamable_http_app()

    @asynccontextmanager
    async def lifespan(app: Starlette) -> AsyncGenerator[None, None]:
        # Start background TTL sweeper
        sweeper = asyncio.create_task(store.run_sweeper(interval_seconds=30.0))
        # Starlette does NOT run the lifespan of a *mounted* sub-app, so the
        # FastMCP StreamableHTTP session manager's task group would never be
        # initialized — the first authenticated /mcp request would then 500
        # with "Task group is not initialized". Drive it from here.
        try:
            async with mcp.session_manager.run():
                yield
        finally:
            sweeper.cancel()
            await supabase.aclose()

    app = Starlette(
        routes=oauth.routes,
        lifespan=lifespan,
    )

    # Mount FastMCP under /mcp. AuthMiddleware below catches it.
    app.mount("/mcp", mcp_app)

    app.add_middleware(
        AuthMiddleware,
        jwt_secret=cfg.supabase_jwt_secret,
        protected_prefix="/mcp",
        resource_metadata_url=f"{cfg.server_base_url}/.well-known/oauth-protected-resource",
    )

    return app
