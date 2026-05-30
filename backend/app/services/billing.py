"""Stripe billing — Checkout, Billing Portal, and webhook handling.

v1: flat $4.99/month per workspace (Pro). The owner starts Checkout, and a
webhook flips `workspaces.plan`. Stripe's SDK async methods (`*_async`) are used
so we don't block the event loop. Webhook writes use a raw service-role Supabase
client (bypasses RLS) since there's no authenticated user on that request.
"""

import stripe
from supabase import AsyncClient, acreate_client

from app.core.config import Settings
from app.services.workspaces import (
    WorkspaceNotFoundError,
    WorkspacePermissionError,
)


class BillingError(Exception):
    """Base class for billing domain errors."""


class BillingNotConfiguredError(BillingError):
    """Stripe keys aren't set — billing is disabled on this deployment."""


class BillingSignatureError(BillingError):
    """Webhook signature failed verification."""


class BillingStateError(BillingError):
    """Operation isn't valid for the workspace's current billing state."""


async def _owned_workspace(
    supabase: AsyncClient, *, user_id: str, workspace_id: str
) -> dict:
    """Fetch the raw workspace row and assert the caller owns it.

    Reads the raw row (not WorkspaceResponse) because we need the
    stripe_* columns that aren't on the API schema.
    """
    row = (
        await supabase.table("workspaces")
        .select("*")
        .eq("id", workspace_id)
        .single()
        .execute()
    ).data
    if not row:
        raise WorkspaceNotFoundError(workspace_id)
    if row["owner_id"] != user_id:
        raise WorkspacePermissionError(workspace_id)
    return row


async def create_checkout(
    supabase: AsyncClient,
    settings: Settings,
    *,
    user_id: str,
    workspace_id: str,
) -> str:
    """Owner-only. Returns a Stripe Checkout URL for upgrading to Pro."""
    if not (settings.stripe_secret_key and settings.stripe_pro_price_id):
        raise BillingNotConfiguredError()
    stripe.api_key = settings.stripe_secret_key

    ws = await _owned_workspace(supabase, user_id=user_id, workspace_id=workspace_id)

    customer_id = ws.get("stripe_customer_id")
    if not customer_id:
        customer = await stripe.Customer.create_async(
            name=ws["name"],
            metadata={"workspace_id": workspace_id},
        )
        customer_id = customer.id
        await (
            supabase.table("workspaces")
            .update({"stripe_customer_id": customer_id})
            .eq("id", workspace_id)
            .execute()
        )

    base = settings.frontend_url.rstrip("/")
    slug = ws["slug"]
    session = await stripe.checkout.Session.create_async(
        mode="subscription",
        customer=customer_id,
        line_items=[{"price": settings.stripe_pro_price_id, "quantity": 1}],
        client_reference_id=workspace_id,
        metadata={"workspace_id": workspace_id},
        # Mirror the id onto the subscription so the cancel webhook can map
        # back to the workspace without a DB lookup.
        subscription_data={"metadata": {"workspace_id": workspace_id}},
        success_url=f"{base}/w/{slug}/plan?billing=success",
        cancel_url=f"{base}/w/{slug}/plan?billing=cancelled",
    )
    return session.url


async def create_portal(
    supabase: AsyncClient,
    settings: Settings,
    *,
    user_id: str,
    workspace_id: str,
) -> str:
    """Owner-only. Returns a Stripe Billing Portal URL (manage / cancel)."""
    if not settings.stripe_secret_key:
        raise BillingNotConfiguredError()
    stripe.api_key = settings.stripe_secret_key

    ws = await _owned_workspace(supabase, user_id=user_id, workspace_id=workspace_id)
    customer_id = ws.get("stripe_customer_id")
    if not customer_id:
        raise BillingStateError("workspace has no Stripe customer to manage")

    base = settings.frontend_url.rstrip("/")
    session = await stripe.billing_portal.Session.create_async(
        customer=customer_id,
        return_url=f"{base}/w/{ws['slug']}/plan",
    )
    return session.url


async def _set_plan(
    settings: Settings, *, workspace_id: str, plan: str, subscription_id: str | None
) -> None:
    """Flip a workspace's plan via a raw service-role client (no RLS)."""
    client = await acreate_client(
        settings.supabase_url, settings.supabase_service_key
    )
    await (
        client.table("workspaces")
        .update({"plan": plan, "stripe_subscription_id": subscription_id})
        .eq("id", workspace_id)
        .execute()
    )


async def handle_event(
    settings: Settings, *, payload: bytes, sig_header: str
) -> None:
    """Verify and process a Stripe webhook event.

    Handles the two events that drive the plan column:
      - checkout.session.completed   → upgrade to Pro
      - customer.subscription.deleted → downgrade to Free
    Everything else is acknowledged and ignored.
    """
    if not (settings.stripe_webhook_secret and settings.stripe_secret_key):
        raise BillingNotConfiguredError()
    stripe.api_key = settings.stripe_secret_key

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.stripe_webhook_secret
        )
    except (ValueError, stripe.error.SignatureVerificationError) as exc:
        raise BillingSignatureError() from exc

    etype = event["type"]
    obj = event["data"]["object"]

    if etype == "checkout.session.completed":
        workspace_id = obj.get("client_reference_id") or (
            obj.get("metadata") or {}
        ).get("workspace_id")
        if workspace_id:
            await _set_plan(
                settings,
                workspace_id=workspace_id,
                plan="pro",
                subscription_id=obj.get("subscription"),
            )
    elif etype == "customer.subscription.deleted":
        workspace_id = (obj.get("metadata") or {}).get("workspace_id")
        if workspace_id:
            await _set_plan(
                settings,
                workspace_id=workspace_id,
                plan="free",
                subscription_id=None,
            )
        else:
            # No metadata — fall back to matching by stored subscription id.
            client = await acreate_client(
                settings.supabase_url, settings.supabase_service_key
            )
            rows = (
                await client.table("workspaces")
                .select("id")
                .eq("stripe_subscription_id", obj.get("id"))
                .execute()
            ).data
            for r in rows:
                await _set_plan(
                    settings, workspace_id=r["id"], plan="free", subscription_id=None
                )
