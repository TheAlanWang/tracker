"""Supabase /auth/v1/* wrapper. Async httpx, no state.

We're not using supabase-py — it's heavier than we need and pulls in postgrest
deps. Three calls is enough surface area to inline.
"""

from typing import Any, Literal
from urllib.parse import urlencode

import httpx

Provider = Literal["github", "google"]
_ALLOWED_PROVIDERS: frozenset[str] = frozenset({"github", "google"})


class SupabaseAuthError(Exception):
    pass


class SupabaseAuthClient:
    def __init__(self, supabase_url: str, anon_key: str) -> None:
        self._base = supabase_url.rstrip("/")
        self._anon = anon_key
        # one client per process; created lazily so tests don't need event loop at import
        self._http: httpx.AsyncClient | None = None

    async def _client(self) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(timeout=15.0)
        return self._http

    def build_authorize_url(
        self,
        provider: Provider,
        redirect_to: str,
        code_challenge: str,
        state: str,
    ) -> str:
        if provider not in _ALLOWED_PROVIDERS:
            raise ValueError(f"unknown provider {provider!r}")
        params = {
            "provider": provider,
            "redirect_to": redirect_to,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
            "state": state,
        }
        return f"{self._base}/auth/v1/authorize?{urlencode(params)}"

    async def exchange_code(self, code: str, code_verifier: str) -> dict[str, Any]:
        return await self._post_token(
            grant_type="pkce",
            extra={"auth_code": code, "code_verifier": code_verifier},
        )

    async def refresh(self, refresh_token: str) -> dict[str, Any]:
        return await self._post_token(
            grant_type="refresh_token",
            extra={"refresh_token": refresh_token},
        )

    async def _post_token(self, grant_type: str, extra: dict[str, str]) -> dict[str, Any]:
        client = await self._client()
        resp = await client.post(
            f"{self._base}/auth/v1/token",
            params={"grant_type": grant_type},
            json=extra,
            headers={"apikey": self._anon, "Content-Type": "application/json"},
        )
        if resp.status_code >= 400:
            try:
                body = resp.json()
            except Exception:
                body = {"error": resp.text or "unknown"}
            raise SupabaseAuthError(
                f"Supabase /token {grant_type} failed ({resp.status_code}): {body}"
            )
        return resp.json()

    async def aclose(self) -> None:
        if self._http is not None:
            await self._http.aclose()
            self._http = None
