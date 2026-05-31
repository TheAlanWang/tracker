"""Trackly REST API client. Reads bearer from request contextvar; forwards verbatim.

v1 minted JWTs locally. v2 doesn't know any secrets — it relies on the auth
middleware having validated whatever the client sent, and just passes it on.
The backend's verify_supabase_jwt accepts the same token (same HS256 secret).
"""

from typing import Any

import httpx

from .context import get_bearer


class TracklyError(Exception):
    """Non-2xx response from the Trackly REST API."""


class TrackerClient:
    def __init__(self, api_url: str, web_url: str = "") -> None:
        self.api_url = api_url.rstrip("/")
        # Frontend origin for building human-facing task links; injected from
        # config at startup. Empty only in unit tests that don't need links.
        self.web_url = web_url.rstrip("/")
        self._http: httpx.AsyncClient | None = None

    async def _client(self) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(base_url=self.api_url, timeout=30.0)
        return self._http

    async def request(
        self, method: str, path: str, **kwargs: Any
    ) -> httpx.Response:
        bearer = get_bearer()  # LookupError if middleware didn't run — that's a bug, fail loud
        client = await self._client()
        headers = {
            "Authorization": f"Bearer {bearer}",
            **kwargs.pop("headers", {}),
        }
        resp = await client.request(method, path, headers=headers, **kwargs)
        if resp.status_code >= 400:
            try:
                detail = resp.json().get("detail", resp.text)
            except Exception:
                detail = resp.text
            raise TracklyError(f"{method} {path} → {resp.status_code}: {detail}")
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

    async def delete(self, path: str, **kwargs: Any) -> Any:
        resp = await self.request("DELETE", path, **kwargs)
        return resp.json() if resp.text else None

    async def aclose(self) -> None:
        if self._http is not None:
            await self._http.aclose()
            self._http = None


# Module-level singleton built at app startup (app.py sets it before serving)
_CLIENT: TrackerClient | None = None


def init_client(api_url: str, web_url: str = "") -> TrackerClient:
    global _CLIENT
    _CLIENT = TrackerClient(api_url=api_url, web_url=web_url)
    return _CLIENT


def get_client() -> TrackerClient:
    if _CLIENT is None:
        raise RuntimeError("client not initialised — call init_client() at startup")
    return _CLIENT


# Resolver helpers — unchanged from v1, but they now read bearer from context.
async def resolve_workspace(slug: str) -> dict[str, Any]:
    client = get_client()
    workspaces = await client.get("/workspaces")
    for ws in workspaces:
        if ws["slug"] == slug:
            return ws
    raise TracklyError(f"No workspace with slug {slug!r} accessible to you.")


async def resolve_task_identifier(identifier: str) -> dict[str, Any]:
    client = get_client()
    return await client.get(f"/resolve/identifier/{identifier}")


async def resolve_project_key(workspace_id: str, key: str) -> dict[str, Any]:
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
    client = get_client()
    if len(key_or_id) == 36 and key_or_id.count("-") == 4:
        return await client.get(f"/projects/{key_or_id}")
    workspaces = await client.get("/workspaces")
    for ws in workspaces:
        projects = await client.get(f"/workspaces/{ws['id']}/projects")
        for p in projects:
            if p["key"].upper() == key_or_id.upper():
                return p
    raise TracklyError(
        f"No project with key {key_or_id!r} found in any of your workspaces."
    )
