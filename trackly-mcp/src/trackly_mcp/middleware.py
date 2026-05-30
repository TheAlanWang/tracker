"""ASGI middleware that protects /mcp with HS256 Supabase JWT verification.

Only paths under `protected_prefix` require auth. OAuth endpoints
(/authorize, /callback, /token, /.well-known/*) bypass this entirely.

On success, sets CURRENT_BEARER + CURRENT_USER_ID contextvars for downstream
tools to read. Resets on response, even on exception.
"""

import jwt
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
            payload = jwt.decode(
                token,
                self._secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
        except jwt.PyJWTError:
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
