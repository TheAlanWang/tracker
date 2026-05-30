"""End-to-end OAuth flow through MCP routes, with Supabase mocked."""

from urllib.parse import parse_qs, urlparse

import httpx
import pytest
import respx
from starlette.applications import Starlette

from trackly_mcp.oauth.routes import build_oauth_router
from trackly_mcp.oauth.state import StateStore
from trackly_mcp.oauth.supabase import SupabaseAuthClient


@pytest.fixture
def store():
    return StateStore(ttl_seconds=60)


@pytest.fixture
def supabase():
    return SupabaseAuthClient(supabase_url="https://supa.test", anon_key="anon")


@pytest.fixture
def app(store, supabase):
    router = build_oauth_router(
        store=store,
        supabase=supabase,
        server_base_url="https://mcp.test",
    )
    app = Starlette(routes=router.routes)
    return app


@pytest.fixture
def transport(app):
    return httpx.ASGITransport(app=app)


async def test_well_known_oauth_protected_resource(transport):
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/.well-known/oauth-protected-resource")
    assert r.status_code == 200
    body = r.json()
    assert body["resource"] == "https://mcp.test/mcp"
    assert "https://mcp.test" in body["authorization_servers"]


async def test_well_known_authorization_server(transport):
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/.well-known/oauth-authorization-server")
    assert r.status_code == 200
    body = r.json()
    assert body["authorization_endpoint"] == "https://mcp.test/authorize"
    assert body["token_endpoint"] == "https://mcp.test/token"
    assert body["registration_endpoint"] == "https://mcp.test/register"
    assert "S256" in body["code_challenge_methods_supported"]


async def test_register_returns_client_id(transport):
    """Dynamic Client Registration (RFC 7591) — MCP clients need this."""
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post(
            "/register",
            json={
                "client_name": "Claude",
                "redirect_uris": ["http://localhost:1234/cb"],
            },
        )
    assert r.status_code == 201
    body = r.json()
    assert body["client_id"]
    assert body["token_endpoint_auth_method"] == "none"
    assert body["redirect_uris"] == ["http://localhost:1234/cb"]


async def test_authorize_renders_picker(transport):
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get(
            "/authorize",
            params={
                "client_id": "claude-desktop",
                "redirect_uri": "http://127.0.0.1:1234/cb",
                "response_type": "code",
                "code_challenge": "cc",
                "code_challenge_method": "S256",
                "state": "cs",
            },
        )
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]
    assert "Continue with GitHub" in r.text


async def test_authorize_rejects_bad_redirect_uri(transport):
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get(
            "/authorize",
            params={
                "redirect_uri": "http://attacker.test/cb",
                "code_challenge": "cc",
                "code_challenge_method": "S256",
                "state": "cs",
            },
        )
    assert r.status_code == 400


async def test_authorize_rejects_missing_pkce(transport):
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get(
            "/authorize",
            params={
                "redirect_uri": "http://127.0.0.1:1/cb",
                "state": "cs",
                # no code_challenge — must reject
            },
        )
    assert r.status_code == 400


async def test_authorize_start_redirects_to_supabase(transport, store):
    # First call /authorize to seed the state dict via the picker.
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        await c.get(
            "/authorize",
            params={
                "redirect_uri": "http://127.0.0.1:1/cb",
                "code_challenge": "cc",
                "code_challenge_method": "S256",
                "state": "cs",
            },
        )
        # Find the request_id the picker stored — it's the only key in the store.
        request_id = next(iter(store._auth.keys()))  # noqa: SLF001  (test internals)
        r = await c.get(
            "/authorize/start",
            params={"request_id": request_id, "provider": "github"},
            follow_redirects=False,
        )
    assert r.status_code in (302, 303)
    loc = r.headers["location"]
    assert loc.startswith("https://supa.test/auth/v1/authorize")
    assert "provider=github" in loc


@respx.mock
async def test_callback_to_token_full_flow(transport, store):
    # Seed Supabase token-exchange response
    respx.post("https://supa.test/auth/v1/token").mock(
        return_value=httpx.Response(
            200,
            json={"access_token": "sb-at", "refresh_token": "sb-rt"},
        )
    )

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        # 1. /authorize → store seeded
        await c.get(
            "/authorize",
            params={
                "redirect_uri": "http://127.0.0.1:9000/cb",
                "code_challenge": "client-chal",
                "code_challenge_method": "S256",
                "state": "client-state",
            },
        )
        request_id = next(iter(store._auth.keys()))  # noqa: SLF001

        # 2. /authorize/start → Supabase URL + sets mcp_flow cookie (= new_state,
        #    the key it just stored in the auth dict).
        r = await c.get(
            "/authorize/start",
            params={"request_id": request_id, "provider": "github"},
            follow_redirects=False,
        )
        flow_id = next(iter(store._auth.keys()))  # noqa: SLF001

        # 3. Supabase redirects to /callback with ?code= (no state); we carry the
        #    flow cookie. (Passed explicitly — the cookie is Secure, won't ride
        #    the test's http transport via the jar.)
        r = await c.get(
            "/callback",
            params={"code": "sb-code"},
            cookies={"mcp_flow": flow_id},
            follow_redirects=False,
        )
        assert r.status_code in (302, 303)
        cb_loc = r.headers["location"]
        cb_qs = parse_qs(urlparse(cb_loc).query)
        assert cb_loc.startswith("http://127.0.0.1:9000/cb")
        assert "code" in cb_qs
        assert cb_qs["state"] == ["client-state"]
        mcp_code = cb_qs["code"][0]

        # 4. Client posts /token with code + verifier whose SHA256 = "client-chal"
        # For test, we can't use a real verifier→challenge pair without computing SHA256.
        # Instead, monkey-patch the SHA256 step in the route — done via the fixture below.
        # Here, just confirm 400 when verifier mismatches.
        r = await c.post(
            "/token",
            data={
                "grant_type": "authorization_code",
                "code": mcp_code,
                "code_verifier": "wrong-verifier",
            },
        )
        assert r.status_code == 400


@respx.mock
async def test_token_verifier_match_returns_supabase_tokens(transport, store):
    """Use a real verifier→challenge pair so /token succeeds."""
    import base64
    import hashlib

    respx.post("https://supa.test/auth/v1/token").mock(
        return_value=httpx.Response(
            200, json={"access_token": "sb-at-2", "refresh_token": "sb-rt-2"}
        )
    )

    verifier = "abcdefghijklmnopqrstuvwxyz0123456789abc"
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).rstrip(b"=").decode()

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        await c.get(
            "/authorize",
            params={
                "redirect_uri": "http://127.0.0.1:9000/cb",
                "code_challenge": challenge,
                "code_challenge_method": "S256",
                "state": "cs",
            },
        )
        request_id = next(iter(store._auth.keys()))  # noqa: SLF001
        r = await c.get(
            "/authorize/start",
            params={"request_id": request_id, "provider": "github"},
            follow_redirects=False,
        )
        flow_id = next(iter(store._auth.keys()))  # noqa: SLF001
        r = await c.get(
            "/callback",
            params={"code": "sb"},
            cookies={"mcp_flow": flow_id},
            follow_redirects=False,
        )
        mcp_code = parse_qs(urlparse(r.headers["location"]).query)["code"][0]

        r = await c.post(
            "/token",
            data={
                "grant_type": "authorization_code",
                "code": mcp_code,
                "code_verifier": verifier,
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert body["access_token"] == "sb-at-2"
        assert body["refresh_token"] == "sb-rt-2"
        assert body["token_type"] == "Bearer"


@respx.mock
async def test_token_refresh_grant_proxies_to_supabase(transport):
    respx.post("https://supa.test/auth/v1/token").mock(
        return_value=httpx.Response(
            200, json={"access_token": "new-at", "refresh_token": "new-rt"}
        )
    )
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post(
            "/token",
            data={"grant_type": "refresh_token", "refresh_token": "old-rt"},
        )
    assert r.status_code == 200
    assert r.json()["access_token"] == "new-at"


async def test_token_code_is_one_time(transport, store):
    """Invariant #7. Re-using a code returns 400."""
    # Build same flow as test above; re-POST /token with same code.
    # Setup omitted for brevity — covered by integration in the previous test.
    # For unit confidence, directly seed the store:
    from trackly_mcp.oauth.state import SupabaseTokens
    import base64
    import hashlib

    verifier = "verif-one-time-1234567890abcdefg"
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).rstrip(b"=").decode()
    store.put_tokens(
        "code-once",
        SupabaseTokens(access_token="a", refresh_token="r", client_challenge=challenge),
    )

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r1 = await c.post(
            "/token",
            data={
                "grant_type": "authorization_code",
                "code": "code-once",
                "code_verifier": verifier,
            },
        )
        assert r1.status_code == 200
        r2 = await c.post(
            "/token",
            data={
                "grant_type": "authorization_code",
                "code": "code-once",
                "code_verifier": verifier,
            },
        )
        assert r2.status_code == 400
