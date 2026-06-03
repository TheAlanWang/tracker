"""Unit tests for the resolve service.

Uses a tiny fake Supabase whose query objects record `.eq()` filters and answer
`.execute()` from a per-table resolver callable. This lets the collision test
actually prove that `resolve_scoped` walks slug → project → task by the supplied
filters (so two workspaces sharing key RAG + identifier RAG-10 resolve to the
correct one), rather than just asserting against a single canned row.
"""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.services.resolve import resolve_identifier, resolve_scoped


class _Query:
    def __init__(self, resolver):
        self._resolver = resolver
        self._filters: dict = {}
        self._single = False

    def select(self, *a, **k):
        return self

    def eq(self, col, val):
        self._filters[col] = val
        return self

    def in_(self, col, vals):
        self._filters[col] = vals
        return self

    def limit(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def single(self):
        self._single = True
        return self

    async def execute(self):
        rows = self._resolver(self._filters)
        data = (rows[0] if rows else None) if self._single else rows
        return SimpleNamespace(data=data)


class _FakeSupabase:
    def __init__(self, resolvers: dict):
        self._resolvers = resolvers

    def table(self, name):
        return _Query(self._resolvers[name])


# Two workspaces the test user belongs to, both with a project keyed RAG that
# both have a task RAG-10 — the exact cross-workspace collision scenario.
_WS_BY_SLUG = {"team-a": "ws-a", "team-b": "ws-b"}
_SLUG_BY_WS = {v: k for k, v in _WS_BY_SLUG.items()}
_PROJ_BY_WS = {"ws-a": "p-a", "ws-b": "p-b"}
_TASK_BY_PROJ = {"p-a": "task-a", "p-b": "task-b"}
_KEY_BY_PROJ = {"p-a": "RAG", "p-b": "RAG"}


def _workspaces(f):
    if "slug" in f:
        wid = _WS_BY_SLUG.get(f["slug"])
        return [{"id": wid, "slug": f["slug"]}] if wid else []
    if "id" in f:  # by-id fetch (resolve_identifier final lookup, .single())
        slug = _SLUG_BY_WS.get(f["id"])
        return [{"slug": slug}] if slug else []
    return []


def _members_all(f):
    return [{"role": "member"}]


def _members_none(f):
    return []


def _projects(f):
    if "id" in f:  # by-id fetch (.single())
        return [{"key": _KEY_BY_PROJ.get(f["id"])}]
    pid = _PROJ_BY_WS.get(f.get("workspace_id"))
    return [{"id": pid, "key": f.get("key")}] if pid else []


def _tasks_scoped(f):
    tid = _TASK_BY_PROJ.get(f.get("project_id"))
    return [{"id": tid, "identifier": f.get("identifier")}] if tid else []


def _scoped_supabase(members=_members_all):
    return _FakeSupabase(
        {
            "workspaces": _workspaces,
            "workspace_members": members,
            "projects": _projects,
            "tasks": _tasks_scoped,
        }
    )


async def test_resolve_scoped_returns_task():
    res = await resolve_scoped(
        _scoped_supabase(),
        user_id="u",
        ws_slug="team-b",
        project_key="RAG",
        identifier="RAG-10",
    )
    assert res.task_id == "task-b"
    assert res.workspace_slug == "team-b"
    assert res.project_key == "RAG"


async def test_resolve_scoped_collision_returns_correct_workspace():
    """The regression: both workspaces have project RAG + task RAG-10. The
    scoped resolver must return each workspace's own task, never the other's."""
    sb = _scoped_supabase()
    res_b = await resolve_scoped(
        sb, user_id="u", ws_slug="team-b", project_key="RAG", identifier="RAG-10"
    )
    res_a = await resolve_scoped(
        sb, user_id="u", ws_slug="team-a", project_key="RAG", identifier="RAG-10"
    )
    assert res_b.task_id == "task-b"
    assert res_a.task_id == "task-a"


async def test_resolve_scoped_lowercase_url_normalizes():
    res = await resolve_scoped(
        _scoped_supabase(),
        user_id="u",
        ws_slug="team-b",
        project_key="rag",
        identifier="rag-10",
    )
    assert res.task_id == "task-b"


async def test_resolve_scoped_non_member_404():
    with pytest.raises(HTTPException) as exc:
        await resolve_scoped(
            _scoped_supabase(members=_members_none),
            user_id="outsider",
            ws_slug="team-b",
            project_key="RAG",
            identifier="RAG-10",
        )
    assert exc.value.status_code == 404


async def test_resolve_scoped_unknown_workspace_404():
    with pytest.raises(HTTPException) as exc:
        await resolve_scoped(
            _scoped_supabase(),
            user_id="u",
            ws_slug="nope",
            project_key="RAG",
            identifier="RAG-10",
        )
    assert exc.value.status_code == 404


async def test_resolve_scoped_unknown_identifier_404():
    sb = _FakeSupabase(
        {
            "workspaces": _workspaces,
            "workspace_members": _members_all,
            "projects": _projects,
            "tasks": lambda f: [],  # no task matches
        }
    )
    with pytest.raises(HTTPException) as exc:
        await resolve_scoped(
            sb, user_id="u", ws_slug="team-b", project_key="RAG", identifier="RAG-99"
        )
    assert exc.value.status_code == 404


# --- resolve_identifier (bare shortlink, ambiguous) ---

# Oldest first (created_at order): task-a precedes task-b.
_BARE_TASK_MATCHES = [
    {"id": "task-a", "identifier": "RAG-10", "workspace_id": "ws-a", "project_id": "p-a"},
    {"id": "task-b", "identifier": "RAG-10", "workspace_id": "ws-b", "project_id": "p-b"},
]


def _bare_supabase():
    return _FakeSupabase(
        {
            "workspace_members": lambda f: [
                {"workspace_id": "ws-a"},
                {"workspace_id": "ws-b"},
            ],
            "tasks": lambda f: list(_BARE_TASK_MATCHES),
            "workspaces": _workspaces,
            "projects": _projects,
        }
    )


async def test_resolve_identifier_prefers_hinted_workspace():
    res = await resolve_identifier(
        _bare_supabase(),
        user_id="u",
        identifier="RAG-10",
        prefer_workspace="team-b",
    )
    assert res.task_id == "task-b"
    assert res.workspace_slug == "team-b"


async def test_resolve_identifier_fallback_is_deterministic():
    res = await resolve_identifier(
        _bare_supabase(), user_id="u", identifier="RAG-10"
    )
    # No hint → oldest match (task-a), never arbitrary.
    assert res.task_id == "task-a"


async def test_resolve_identifier_hint_ignored_when_not_a_member():
    # Hint points at a workspace the user doesn't belong to → falls back.
    res = await resolve_identifier(
        _bare_supabase(),
        user_id="u",
        identifier="RAG-10",
        prefer_workspace="team-c",  # unknown slug
    )
    assert res.task_id == "task-a"


async def test_resolve_identifier_no_match_404():
    sb = _FakeSupabase(
        {
            "workspace_members": lambda f: [{"workspace_id": "ws-a"}],
            "tasks": lambda f: [],
        }
    )
    with pytest.raises(HTTPException) as exc:
        await resolve_identifier(sb, user_id="u", identifier="RAG-10")
    assert exc.value.status_code == 404
