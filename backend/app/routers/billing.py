from fastapi import APIRouter, Depends, HTTPException, Request, status
from supabase import AsyncClient

from app.core.config import Settings, get_settings
from app.core.deps import get_current_user_id, get_supabase_admin
from app.schemas.billing import (
    BillingUrlResponse,
    CheckoutRequest,
    PortalRequest,
)
from app.services.billing import (
    BillingNotConfiguredError,
    BillingSignatureError,
    BillingStateError,
    create_checkout,
    create_portal,
    handle_event,
)
from app.services.workspaces import (
    WorkspaceNotFoundError,
    WorkspacePermissionError,
)

router = APIRouter(prefix="/billing", tags=["billing"])


@router.post("/checkout", response_model=BillingUrlResponse)
async def checkout(
    payload: CheckoutRequest,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
    settings: Settings = Depends(get_settings),
):
    try:
        url = await create_checkout(
            supabase, settings, user_id=user_id, workspace_id=payload.workspace_id
        )
        return BillingUrlResponse(url=url)
    except BillingNotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Billing is not configured",
        ) from exc
    except BillingStateError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    except WorkspacePermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except WorkspaceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.post("/portal", response_model=BillingUrlResponse)
async def portal(
    payload: PortalRequest,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
    settings: Settings = Depends(get_settings),
):
    try:
        url = await create_portal(
            supabase, settings, user_id=user_id, workspace_id=payload.workspace_id
        )
        return BillingUrlResponse(url=url)
    except BillingNotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Billing is not configured",
        ) from exc
    except BillingStateError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    except WorkspacePermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN) from exc
    except WorkspaceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc


@router.post("/webhook")
async def webhook(
    request: Request,
    settings: Settings = Depends(get_settings),
):
    # Unauthenticated by design — Stripe calls this server-to-server; the
    # signature header (verified in handle_event) is the auth boundary.
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    try:
        await handle_event(settings, payload=payload, sig_header=sig_header)
    except BillingSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signature"
        ) from exc
    except BillingNotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Billing is not configured",
        ) from exc
    return {"received": True}
