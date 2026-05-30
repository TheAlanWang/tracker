"""All 6 OAuth endpoints, wired into a Starlette Router.

Endpoints:
  - GET /.well-known/oauth-protected-resource
  - GET /.well-known/oauth-authorization-server
  - GET /authorize                  (renders picker; stores request_id → AuthState)
  - GET /authorize/start            (button-click; redirect to Supabase)
  - GET /callback                   (Supabase → us; exchanges code, redirects client)
  - POST /token                     (authorization_code + refresh_token grants)

Security invariants enforced inline:
  - #6: redirect_uri validated before any state is written
  - #7: codes & state are pop'd from store on use
"""

import base64
import hashlib
import secrets
import time
from urllib.parse import urlencode

from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from starlette.routing import Route, Router

from .picker import render_picker
from .state import AuthState, StateStore, SupabaseTokens
from .supabase import SupabaseAuthClient, SupabaseAuthError
from .validators import InvalidRedirectURI, validate_redirect_uri


def _b64sha256(s: str) -> str:
    return base64.urlsafe_b64encode(hashlib.sha256(s.encode()).digest()).rstrip(b"=").decode()


def _token_url(secrets_bytes: int = 32) -> str:
    return secrets.token_urlsafe(secrets_bytes)


def build_oauth_router(
    *, store: StateStore, supabase: SupabaseAuthClient, server_base_url: str
) -> Router:
    base = server_base_url.rstrip("/")

    async def well_known_resource(_: Request) -> JSONResponse:
        return JSONResponse({
            "resource": f"{base}/mcp",
            "authorization_servers": [base],
        })

    async def well_known_auth_server(_: Request) -> JSONResponse:
        return JSONResponse({
            "issuer": base,
            "authorization_endpoint": f"{base}/authorize",
            "token_endpoint": f"{base}/token",
            "registration_endpoint": f"{base}/register",
            "response_types_supported": ["code"],
            "grant_types_supported": ["authorization_code", "refresh_token"],
            "code_challenge_methods_supported": ["S256"],
            "token_endpoint_auth_methods_supported": ["none"],
        })

    async def register(request: Request) -> Response:
        # RFC 7591 Dynamic Client Registration. MCP clients (Claude Desktop /
        # Code, Cursor) require this to obtain a client_id before /authorize.
        # We are a public-client PKCE proxy: client_id is NOT authenticated and
        # /authorize never checks it — security rests on PKCE + redirect_uri
        # validation. So we don't persist anything; we mint an id and echo the
        # submitted metadata back per the spec.
        try:
            body = await request.json()
        except Exception:
            body = {}
        return JSONResponse(
            {
                "client_id": "mcp-" + _token_url(16),
                "client_id_issued_at": int(time.time()),
                "token_endpoint_auth_method": "none",
                "grant_types": body.get("grant_types")
                or ["authorization_code", "refresh_token"],
                "response_types": body.get("response_types") or ["code"],
                "redirect_uris": body.get("redirect_uris") or [],
                **({"client_name": body["client_name"]} if body.get("client_name") else {}),
            },
            status_code=201,
        )

    async def authorize(request: Request) -> Response:
        params = request.query_params
        redirect_uri = params.get("redirect_uri")
        code_challenge = params.get("code_challenge")
        method = params.get("code_challenge_method", "")
        client_state = params.get("state", "")

        if not redirect_uri:
            return JSONResponse({"error": "missing redirect_uri"}, status_code=400)
        if not code_challenge:
            return JSONResponse({"error": "missing code_challenge (PKCE required)"}, status_code=400)
        if method != "S256":
            return JSONResponse({"error": "only S256 supported"}, status_code=400)
        try:
            validate_redirect_uri(redirect_uri)
        except InvalidRedirectURI as e:
            return JSONResponse({"error": "invalid redirect_uri", "detail": str(e)}, status_code=400)

        request_id = _token_url()
        store.put_auth(
            request_id,
            AuthState(
                server_verifier="",  # filled at /authorize/start
                client_challenge=code_challenge,
                client_redirect_uri=redirect_uri,
                client_state=client_state,
            ),
        )
        return HTMLResponse(render_picker(
            request_id=request_id,
            client_state=client_state,
            client_challenge=code_challenge,
            client_redirect_uri=redirect_uri,
        ))

    async def authorize_start(request: Request) -> Response:
        request_id = request.query_params.get("request_id", "")
        provider_raw = request.query_params.get("provider", "")
        if provider_raw not in ("github", "google"):
            return JSONResponse({"error": "bad provider"}, status_code=400)
        try:
            saved = store.pop_auth(request_id)
        except KeyError:
            return JSONResponse({"error": "request_id expired or invalid"}, status_code=400)

        server_verifier = _token_url(64)
        server_challenge = _b64sha256(server_verifier)
        new_state = _token_url()

        store.put_auth(
            new_state,
            AuthState(
                server_verifier=server_verifier,
                client_challenge=saved.client_challenge,
                client_redirect_uri=saved.client_redirect_uri,
                client_state=saved.client_state,
            ),
        )
        url = supabase.build_authorize_url(
            provider=provider_raw,  # type: ignore[arg-type]
            redirect_to=f"{base}/callback",
            code_challenge=server_challenge,
        )
        # Correlate this flow at /callback via a first-party cookie (Supabase
        # returns only ?code=, no echo of our state). SameSite=Lax so it's sent
        # on the top-level redirect back from Supabase.
        resp = RedirectResponse(url, status_code=303)
        resp.set_cookie(
            "mcp_flow",
            new_state,
            max_age=600,
            httponly=True,
            secure=True,
            samesite="lax",
            path="/",
        )
        return resp

    async def callback(request: Request) -> Response:
        # Supabase redirects here with ?code= (PKCE). It does NOT echo our
        # state, so we recover our flow from the mcp_flow cookie set at
        # /authorize/start. A Supabase-side failure arrives as ?error=...
        sb_code = request.query_params.get("code", "")
        flow_id = request.cookies.get("mcp_flow", "")
        if not sb_code:
            err = request.query_params.get("error_description") or request.query_params.get("error") or "missing code"
            return JSONResponse({"error": "oauth failed", "detail": err}, status_code=400)
        if not flow_id:
            return JSONResponse({"error": "missing flow cookie (start over)"}, status_code=400)
        try:
            saved = store.pop_auth(flow_id)
        except KeyError:
            return JSONResponse({"error": "flow expired or invalid"}, status_code=400)

        try:
            tokens = await supabase.exchange_code(
                code=sb_code, code_verifier=saved.server_verifier
            )
        except SupabaseAuthError as e:
            return JSONResponse({"error": "exchange failed", "detail": str(e)}, status_code=502)

        mcp_code = _token_url()
        store.put_tokens(
            mcp_code,
            SupabaseTokens(
                access_token=tokens["access_token"],
                refresh_token=tokens["refresh_token"],
                client_challenge=saved.client_challenge,
            ),
        )
        loc = saved.client_redirect_uri + "?" + urlencode({
            "code": mcp_code,
            "state": saved.client_state,
        })
        resp = RedirectResponse(loc, status_code=303)
        resp.delete_cookie("mcp_flow", path="/")
        return resp

    async def token(request: Request) -> Response:
        form = await request.form()
        grant = form.get("grant_type", "")

        if grant == "authorization_code":
            code = form.get("code", "")
            verifier = form.get("code_verifier", "")
            try:
                saved = store.pop_tokens(code)
            except KeyError:
                return JSONResponse({"error": "invalid_grant", "detail": "code expired or reused"}, status_code=400)
            if not secrets.compare_digest(_b64sha256(verifier), saved.client_challenge):
                return JSONResponse({"error": "invalid_grant", "detail": "verifier mismatch"}, status_code=400)
            return JSONResponse({
                "access_token": saved.access_token,
                "refresh_token": saved.refresh_token,
                "token_type": "Bearer",
            })

        if grant == "refresh_token":
            rt = form.get("refresh_token", "")
            if not rt:
                return JSONResponse({"error": "missing refresh_token"}, status_code=400)
            try:
                tokens = await supabase.refresh(refresh_token=rt)
            except SupabaseAuthError as e:
                return JSONResponse({"error": "invalid_grant", "detail": str(e)}, status_code=400)
            return JSONResponse({
                "access_token": tokens["access_token"],
                "refresh_token": tokens["refresh_token"],
                "token_type": "Bearer",
            })

        return JSONResponse({"error": "unsupported_grant_type"}, status_code=400)

    return Router(routes=[
        Route("/.well-known/oauth-protected-resource", well_known_resource, methods=["GET"]),
        Route("/.well-known/oauth-authorization-server", well_known_auth_server, methods=["GET"]),
        Route("/register", register, methods=["POST"]),
        Route("/authorize", authorize, methods=["GET"]),
        Route("/authorize/start", authorize_start, methods=["GET"]),
        Route("/callback", callback, methods=["GET"]),
        Route("/token", token, methods=["POST"]),
    ])
