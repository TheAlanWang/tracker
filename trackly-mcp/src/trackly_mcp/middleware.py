"""ASGI middleware that protects /mcp with Supabase JWT verification.

Supports both signing schemes Supabase may use (mirrors the backend's
verify logic): HS256 with the shared legacy secret, and ES256 with the
project's asymmetric JWT signing key fetched from its JWKS endpoint. The
algorithm is chosen per-token from its header.

Only paths under `protected_prefix` require auth. OAuth endpoints
(/authorize, /callback, /token, /.well-known/*) bypass this entirely.

On success, sets CURRENT_BEARER + CURRENT_USER_ID contextvars for downstream
tools to read. Resets on response, even on exception.
"""

import anyio
import jwt
from jwt import PyJWKClient
from starlette.types import ASGIApp, Receive, Scope, Send

from .context import set_request_context, CURRENT_BEARER, CURRENT_USER_ID


class AuthMiddleware:
    def __init__(
        self,
        app: ASGIApp,
        jwt_secret: str,
        protected_prefix: str,
        resource_metadata_url: str,
    ) -> None:
        self.app = app
        self._secret = jwt_secret
        self._prefix = protected_prefix
        self._resource_metadata = resource_metadata_url
        # JWKS clients cached per URL (they cache signing keys internally).
        self._jwks_clients: dict[str, PyJWKClient] = {}

    def _jwks_client(self, url: str) -> PyJWKClient:
        c = self._jwks_clients.get(url)
        if c is None:
            c = PyJWKClient(url)
            self._jwks_clients[url] = c
        return c

    def _decode(self, token: str) -> dict:
        """Verify a Supabase JWT (HS256 shared secret or ES256 via JWKS),
        chosen by the token's alg header. Mirrors the backend. Synchronous —
        run via anyio.to_thread so the ES256 JWKS fetch doesn't block the loop.
        """
        alg = jwt.get_unverified_header(token).get("alg", "HS256")
        if alg == "ES256":
            iss = jwt.decode(token, options={"verify_signature": False}).get("iss", "")
            jwks_url = iss.rstrip("/") + "/.well-known/jwks.json"
            signing_key = self._jwks_client(jwks_url).get_signing_key_from_jwt(token)
            return jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256"],
                audience="authenticated",
            )
        return jwt.decode(
            token,
            self._secret,
            algorithms=["HS256"],
            audience="authenticated",
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        if not scope["path"].startswith(self._prefix):
            await self.app(scope, receive, send)
            return

        token = self._extract_bearer(scope)
        if token is None:
            await self._reject(send, status=401, reason="missing")
            return

        try:
            payload = await anyio.to_thread.run_sync(self._decode, token)
        except Exception as exc:
            # Log WHY (alg + error type) so 401s are diagnosable. Never logs the
            # token or the signing secret. `alg` comes from the UNVERIFIED header
            # (attacker-controlled), so whitelist it and repr()-truncate the
            # message to avoid log injection via crafted values.
            try:
                raw_alg = jwt.get_unverified_header(token).get("alg", "?")
            except Exception:
                raw_alg = "?"
            alg = raw_alg if raw_alg in ("HS256", "ES256") else "other"
            print(
                f"[auth] token rejected: alg={alg} err={type(exc).__name__}: {str(exc)[:120]!r}",
                flush=True,
            )
            await self._reject(send, status=401, reason="invalid")
            return

        user_id = payload.get("sub")
        if not user_id:
            await self._reject(send, status=401, reason="no-sub")
            return

        tokens = set_request_context(bearer=token, user_id=user_id)
        try:
            await self.app(scope, receive, send)
        finally:
            CURRENT_BEARER.reset(tokens.bearer)
            CURRENT_USER_ID.reset(tokens.user_id)

    def _extract_bearer(self, scope: Scope) -> str | None:
        for k, v in scope.get("headers", []):
            if k.lower() == b"authorization":
                raw = v.decode("latin-1")
                if raw.lower().startswith("bearer "):
                    return raw[7:].strip() or None
                return None
        return None

    async def _reject(self, send: Send, status: int, reason: str) -> None:
        challenge = (
            f'Bearer realm="trackly", '
            f'resource_metadata="{self._resource_metadata}"'
        )
        body = f'{{"error":"unauthorized","reason":"{reason}"}}'.encode()
        await send({
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"www-authenticate", challenge.encode()),
            ],
        })
        await send({"type": "http.response.body", "body": body})
