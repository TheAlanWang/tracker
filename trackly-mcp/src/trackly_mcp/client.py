"""Thin httpx wrapper around the Trackly REST API.

Owns the JWT lifecycle: mints a fresh user-JWT every call so we don't
have to worry about token expiry mid-session. (Each token is signed
locally with the shared secret, no network round-trip, so this is
cheap.)

Single client instance per process — `get_client()` lazy-init from the
required env vars.
"""

import os
from functools import lru_cache
from typing import Any

import httpx

from .auth import mint_user_jwt


class TracklyError(Exception):
    """Raised when the Trackly API returns a non-2xx response."""


class TrackerClient:
    def __init__(self, api_url: str, user_id: str, jwt_secret: str) -> None:
        self.api_url = api_url.rstrip("/")
        self.user_id = user_id
        self.jwt_secret = jwt_secret
        # Single httpx.AsyncClient — connection pool + keep-alive across
        # tool calls. Created lazily so test environments without env
        # vars don't fail at import.
        self._http: httpx.AsyncClient | None = None

    async def _client(self) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(base_url=self.api_url, timeout=30.0)
        return self._http

    def _auth_header(self) -> dict[str, str]:
        token = mint_user_jwt(self.user_id, self.jwt_secret)
        return {"Authorization": f"Bearer {token}"}

    async def request(
        self, method: str, path: str, **kwargs: Any
    ) -> httpx.Response:
        client = await self._client()
        headers = {**self._auth_header(), **kwargs.pop("headers", {})}
        resp = await client.request(method, path, headers=headers, **kwargs)
        if resp.status_code >= 400:
            # Surface the backend's error detail when it's there (FastAPI
            # raises HTTPException with `{detail: "..."}`); fall back to
            # the raw body otherwise.
            try:
                detail = resp.json().get("detail", resp.text)
            except Exception:
                detail = resp.text
            raise TracklyError(
                f"{method} {path} → {resp.status_code}: {detail}"
            )
        return resp

    async def get(self, path: str, **kwargs: Any) -> Any:
        resp = await self.request("GET", path, **kwargs)
        return resp.json() if resp.text else None

    async def post(self, path: str, json: Any = None, **kwargs: Any) -> Any:
        resp = await self.request("POST", path, json=json, **kwargs)
        return resp.json() if resp.text else None

    async def patch(self, path: str, json: Any = None, **kwargs: Any) -> Any:
        resp = await self.request("PATCH", path, json=json, **kwargs)
        return resp.json() if resp.text else None

    async def close(self) -> None:
        if self._http is not None:
            await self._http.aclose()
            self._http = None


@lru_cache(maxsize=1)
def get_client() -> TrackerClient:
    api_url = os.environ.get("TRACKLY_API_URL", "https://tracker-thealanwang.fly.dev")
    user_id = os.environ.get("TRACKLY_USER_ID")
    jwt_secret = os.environ.get("TRACKLY_JWT_SECRET")
    if not user_id or not jwt_secret:
        raise RuntimeError(
            "TRACKLY_USER_ID and TRACKLY_JWT_SECRET must be set. "
            "Get the JWT secret from Supabase → Project Settings → API; "
            "the user id from your Trackly account (auth.users.id)."
        )
    return TrackerClient(api_url=api_url, user_id=user_id, jwt_secret=jwt_secret)


async def resolve_workspace(slug: str) -> dict[str, Any]:
    """Resolve a workspace slug → {id, slug, name}.

    Workspaces are listed via `GET /workspaces` (returns every workspace
    the authenticated user is a member of). Cached by lru in tool calls
    isn't safe (workspaces can change) so we just re-fetch each time;
    the call is small.
    """
    client = get_client()
    workspaces = await client.get("/workspaces")
    for ws in workspaces:
        if ws["slug"] == slug:
            return ws
    raise TracklyError(f"No workspace with slug {slug!r} accessible to you.")


async def resolve_task_identifier(identifier: str) -> dict[str, Any]:
    """Resolve a human identifier like 'TRAC-7' → full resolve response."""
    client = get_client()
    return await client.get(f"/resolve/identifier/{identifier}")


async def resolve_project_key(workspace_id: str, key: str) -> dict[str, Any]:
    """Resolve a project key (e.g. 'TRAC') within a workspace → project row."""
    client = get_client()
    projects = await client.get(f"/workspaces/{workspace_id}/projects")
    for p in projects:
        if p["key"] == key:
            return p
    raise TracklyError(
        f"No project with key {key!r} in this workspace. "
        f"Use `list_workspaces` to confirm the workspace + project codes."
    )


async def resolve_project_identifier(key_or_id: str) -> dict[str, Any]:
    """Resolve a project key (e.g. 'FRO') OR a UUID → project row.

    Differs from `resolve_project_key` in that it doesn't need a workspace
    upfront — useful when a tool only knows the key the user said. Falls
    back to scanning every workspace the user belongs to.
    """
    client = get_client()
    # Cheap UUID detection: Trackly project ids are uuid4 (36 chars with
    # dashes at 8/13/18/23). If it looks like a UUID, hit /projects/{id}
    # directly and skip the workspace scan.
    if len(key_or_id) == 36 and key_or_id.count("-") == 4:
        return await client.get(f"/projects/{key_or_id}")

    workspaces = await client.get("/workspaces")
    for ws in workspaces:
        projects = await client.get(f"/workspaces/{ws['id']}/projects")
        for p in projects:
            if p["key"].upper() == key_or_id.upper():
                return p
    raise TracklyError(
        f"No project with key {key_or_id!r} found in any of your workspaces. "
        f"Use `list_projects(workspace_slug)` to confirm the project code."
    )
