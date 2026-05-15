from fastapi import APIRouter, Depends, HTTPException, Query, status
from supabase import Client

from app.core.deps import get_current_user_id, get_supabase_admin
from app.schemas.search import SearchResult
from app.services.search import SearchPermissionError, search

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=list[SearchResult])
def search_route(
    q: str = Query(..., min_length=1),
    ws_id: str = Query(...),
    ws_slug: str = Query(default=""),
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_admin),
) -> list[SearchResult]:
    try:
        return search(
            supabase,
            user_id=user_id,
            query=q,
            workspace_id=ws_id,
            ws_slug=ws_slug,
        )
    except SearchPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
