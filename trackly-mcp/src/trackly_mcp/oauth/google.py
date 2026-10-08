"""Direct Google OAuth leg (authorization-code flow) for the MCP sign-in.

Supabase's hosted Google flow redirects through
https://<ref>.supabase.co/auth/v1/callback, which (a) shows supabase.co on
Google's consent screen and (b) blocks OAuth brand verification, so that
redirect URI is no longer registered on the Google client. Instead we talk to
Google ourselves with our own redirect URI on mcp.gettrackly.dev, exchange the
code for an ID token here (we're a server, so we hold the client secret), and
hand the ID token to Supabase (`grant_type=id_token`) for a normal session.
"""

from typing import Any
from urllib.parse import urlencode

import httpx

_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_TOKEN_URL = "https://oauth2.googleapis.com/token"


class GoogleOAuthError(Exception):
    pass


class GoogleOAuthClient:
    def __init__(self, client_id: str, client_secret: str) -> None:
        self._client_id = client_id
        self._client_secret = client_secret
        self._http: httpx.AsyncClient | None = None

    async def _client(self) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(timeout=15.0)
        return self._http

    def build_authorize_url(self, redirect_uri: str, state: str) -> str:
        params = {
            "client_id": self._client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "prompt": "select_account",
        }
        return f"{_AUTHORIZE_URL}?{urlencode(params)}"

    async def exchange_code(self, code: str, redirect_uri: str) -> dict[str, Any]:
        """Return Google's token response (contains `id_token`, `access_token`)."""
        client = await self._client()
        resp = await client.post(
            _TOKEN_URL,
            data={
                "code": code,
                "client_id": self._client_id,
                "client_secret": self._client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if resp.status_code >= 400:
            raise GoogleOAuthError(
                f"Google /token failed ({resp.status_code}): {resp.text}"
            )
        body = resp.json()
        if not body.get("id_token"):
            raise GoogleOAuthError("Google /token response had no id_token")
        return body

    async def aclose(self) -> None:
        if self._http is not None:
            await self._http.aclose()
            self._http = None
