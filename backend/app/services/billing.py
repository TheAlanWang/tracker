"""Stripe billing — Checkout, Billing Portal, and webhook handling.

v1: flat per-workspace monthly Pro. The owner starts Checkout, and a
webhook flips `workspaces.plan`. Stripe's SDK async methods (`*_async`) are used
so we don't block the event loop. Webhook writes use a raw service-role Supabase
client (bypasses RLS) since there's no authenticated user on that request.
"""

import json

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
    if customer_id:
        # Guard against a second subscription — if one is already active, send
        # the caller to manage it instead of stacking another (this is how the
        # 3-duplicate-subs mess happened during testing).
        existing = await stripe.Subscription.list_async(
            customer=customer_id, status="active", limit=1
        )
        if existing.data:
            raise BillingStateError(
                "This workspace already has an active subscription."
            )
    else:
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
        success_url=f"{base}/w/{slug}/billing?checkout=success",
        cancel_url=f"{base}/w/{slug}/billing?checkout=cancelled",
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
        return_url=f"{base}/w/{ws['slug']}/billing",
    )
    return session.url


async def get_subscription(
    supabase: AsyncClient,
    settings: Settings,
    *,
    user_id: str,
    workspace_id: str,
) -> dict:
    """Owner-only. Returns a live summary of the workspace's Pro subscription
    (renewal date + cancel state) by reading it straight from Stripe — so the
    Billing page always reflects the truth, including a just-issued cancel.
    """
    if not settings.stripe_secret_key:
        raise BillingNotConfiguredError()
    stripe.api_key = settings.stripe_secret_key

    ws = await _owned_workspace(supabase, user_id=user_id, workspace_id=workspace_id)
    sub_id = ws.get("stripe_subscription_id")
    if not sub_id:
        raise BillingStateError("workspace has no active subscription")

    sub = await stripe.Subscription.retrieve_async(sub_id)
    # `current_period_end` sat on the subscription in older API versions; the
    # 2025+ versions moved the billing period onto each subscription item.
    period_end = getattr(sub, "current_period_end", None)
    if not period_end:
        try:
            period_end = sub["items"]["data"][0]["current_period_end"]
        except (KeyError, IndexError, TypeError):
            period_end = None

    # "Cancel at period end" surfaces two ways depending on API version / how
    # the Customer Portal issues it: the `cancel_at_period_end` boolean, OR a
    # `cancel_at` timestamp scheduling the end (what the current portal sets —
    # the boolean stays false). Treat either as "won't renew", and when it's a
    # scheduled cancel use that timestamp as the access-ends date.
    cancel_at = getattr(sub, "cancel_at", None)
    will_cancel = bool(getattr(sub, "cancel_at_period_end", False)) or bool(cancel_at)
    return {
        "status": sub.status,
        "current_period_end": cancel_at or period_end,
        "cancel_at_period_end": will_cancel,
    }


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
        stripe.Webhook.construct_event(
            payload, sig_header, settings.stripe_webhook_secret
        )
    except (ValueError, stripe.error.SignatureVerificationError) as exc:
        raise BillingSignatureError() from exc

    # Read fields off a plain dict: construct_event returns StripeObjects whose
    # `.get()` isn't dict-compatible in this SDK version. We only use
    # construct_event for signature verification above.
    event = json.loads(payload)
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
    elif etype in ("customer.subscription.deleted", "customer.subscription.updated"):
        # Downgrade once the subscription stops granting access — it was deleted,
        # or moved to a terminal status (canceled / unpaid / incomplete_expired).
        # A still-active sub merely flagged cancel_at_period_end keeps Pro until
        # it actually ends (the user paid for the current period); the eventual
        # `deleted` event handles that. For *immediate* downgrade on cancel, set
        # the Stripe Customer Portal to "cancel immediately".
        inactive = etype == "customer.subscription.deleted" or obj.get(
            "status"
        ) in ("canceled", "unpaid", "incomplete_expired")
        if not inactive:
            return

        workspace_id = (obj.get("metadata") or {}).get("workspace_id")
        if workspace_id:
            await _set_plan(
                settings, workspace_id=workspace_id, plan="free", subscription_id=None
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
