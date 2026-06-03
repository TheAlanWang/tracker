"""Resolve task identifiers to their canonical workspace/project location."""

from fastapi import APIRouter, Depends, Query
from supabase import AsyncClient

from app.core.deps import get_current_user_id, get_supabase_admin
from app.services.resolve import (
    ResolveResponse,
    resolve_identifier,
    resolve_scoped,
)

router = APIRouter(tags=["resolve"])


@router.get("/resolve/identifier/{identifier}", response_model=ResolveResponse)
async def resolve_identifier_route(
    identifier: str,
    prefer_workspace: str | None = Query(None),
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
) -> ResolveResponse:
    """Bare-identifier shortlink resolver (``/browse``, MCP). Ambiguous across
    workspaces; ``prefer_workspace`` disambiguates, else oldest match wins."""
    return await resolve_identifier(
        supabase,
        user_id=user_id,
        identifier=identifier,
        prefer_workspace=prefer_workspace,
    )


@router.get(
    "/resolve/scoped/{ws_slug}/{project_key}/{identifier}",
    response_model=ResolveResponse,
)
async def resolve_scoped_route(
    ws_slug: str,
    project_key: str,
    identifier: str,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
) -> ResolveResponse:
    """Strict resolver for the canonical in-app route — resolves to exactly one
    task or 404, immune to cross-workspace identifier collisions."""
    return await resolve_scoped(
        supabase,
        user_id=user_id,
        ws_slug=ws_slug,
        project_key=project_key,
        identifier=identifier,
    )
