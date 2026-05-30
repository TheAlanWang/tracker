"""PKCE + authorization-code in-process state. 90-second TTL, swept in background.

Two dicts:
  - auth: state' → AuthState   (lifecycle: /authorize/start → /callback)
  - tokens: mcp_code → SupabaseTokens  (lifecycle: /callback → /token)

Both honour security invariant #7 (one-time use) by popping on read.

Single-process by design — see spec "Single-instance state" risk. If we ever
horizontally scale, swap this for JWT-encoded state.
"""

import asyncio
import time
from dataclasses import dataclass


@dataclass(frozen=True)
class AuthState:
    server_verifier: str          # our PKCE verifier with Supabase
    client_challenge: str         # MCP client's PKCE challenge (we hold this until /token)
    client_redirect_uri: str      # mirrored back to client at /callback
    client_state: str             # mirrored back to client at /callback


@dataclass(frozen=True)
class SupabaseTokens:
    access_token: str
    refresh_token: str
    client_challenge: str         # binds the issued mcp_code to a specific client


class StateStore:
    def __init__(self, ttl_seconds: float = 90.0) -> None:
        self._ttl = ttl_seconds
        # value: (payload, expires_at_monotonic)
        self._auth: dict[str, tuple[AuthState, float]] = {}
        self._tokens: dict[str, tuple[SupabaseTokens, float]] = {}

    def put_auth(self, state: str, value: AuthState) -> None:
        self._auth[state] = (value, time.monotonic() + self._ttl)

    def pop_auth(self, state: str) -> AuthState:
        value, expires_at = self._auth.pop(state)  # KeyError if missing
        if time.monotonic() > expires_at:
            raise KeyError(f"state {state!r} expired")
        return value

    def put_tokens(self, code: str, value: SupabaseTokens) -> None:
        self._tokens[code] = (value, time.monotonic() + self._ttl)

    def pop_tokens(self, code: str) -> SupabaseTokens:
        value, expires_at = self._tokens.pop(code)  # KeyError if missing
        if time.monotonic() > expires_at:
            raise KeyError(f"code {code!r} expired")
        return value

    def sweep(self) -> None:
        """Drop expired entries. Called by background task."""
        now = time.monotonic()
        self._auth = {k: v for k, v in self._auth.items() if v[1] > now}
        self._tokens = {k: v for k, v in self._tokens.items() if v[1] > now}

    async def run_sweeper(self, interval_seconds: float = 30.0) -> None:
        """Long-running task; cancel on app shutdown."""
        while True:
            await asyncio.sleep(interval_seconds)
            self.sweep()
