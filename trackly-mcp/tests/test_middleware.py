"""ASGI auth middleware: verify HS256 Supabase tokens, set contextvars, return 401 on fail."""

import time

import httpx
import jwt
import pytest
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from trackly_mcp.context import get_bearer, get_user_id
from trackly_mcp.middleware import AuthMiddleware

SECRET = "test-secret-32-bytes-for-hs256-yes"


def _mint(sub: str = "u-1", aud: str = "authenticated", expires_in: int = 60) -> str:
    now = int(time.time())
    return jwt.encode(
        {"sub": sub, "aud": aud, "iat": now, "exp": now + expires_in},
        SECRET,
        algorithm="HS256",
    )


async def _whoami(request: Request) -> JSONResponse:
    return JSONResponse({"sub": get_user_id(), "bearer": get_bearer()})


@pytest.fixture
def app():
    app = Starlette(routes=[Route("/mcp", _whoami, methods=["GET"])])
    app.add_middleware(
        AuthMiddleware,
        jwt_secret=SECRET,
        protected_prefix="/mcp",
        resource_metadata_url="https://mcp.test/.well-known/oauth-protected-resource",
    )
    return app


async def test_valid_token_passes_through(app):
    transport = httpx.ASGITransport(app=app)
    tok = _mint(sub="user-A")
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/mcp", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200
    assert r.json() == {"sub": "user-A", "bearer": tok}


async def test_missing_authorization_returns_401(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/mcp")
    assert r.status_code == 401
    assert "Bearer" in r.headers["WWW-Authenticate"]
    assert "resource_metadata" in r.headers["WWW-Authenticate"]


async def test_malformed_authorization_returns_401(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/mcp", headers={"Authorization": "NotBearer foo"})
    assert r.status_code == 401


async def test_invalid_signature_returns_401(app):
    transport = httpx.ASGITransport(app=app)
    bad = jwt.encode(
        {"sub": "u", "aud": "authenticated", "exp": int(time.time()) + 60},
        "wrong-secret-padded-32-bytes-for-hs",
        algorithm="HS256",
    )
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/mcp", headers={"Authorization": f"Bearer {bad}"})
    assert r.status_code == 401


async def test_expired_token_returns_401(app):
    transport = httpx.ASGITransport(app=app)
    tok = _mint(expires_in=-1)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/mcp", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 401


async def test_wrong_audience_returns_401(app):
    transport = httpx.ASGITransport(app=app)
    tok = _mint(aud="service_role")  # not "authenticated"
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/mcp", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 401


async def test_unprotected_path_does_not_check_auth(app):
    """Only /mcp* is protected; OAuth endpoints (/authorize etc.) are not."""
    @app.router.routes.append  # type: ignore[arg-type]
    async def _():
        pass
    # Re-mount a simple unprotected route
    app.router.routes.insert(0, Route("/authorize", lambda r: JSONResponse({}), methods=["GET"]))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/authorize")
    assert r.status_code == 200
