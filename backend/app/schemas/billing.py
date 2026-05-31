from pydantic import BaseModel


class CheckoutRequest(BaseModel):
    workspace_id: str


class PortalRequest(BaseModel):
    workspace_id: str


class BillingUrlResponse(BaseModel):
    # A Stripe-hosted URL (Checkout or Billing Portal) the client redirects to.
    url: str


class SubscriptionResponse(BaseModel):
    # Live summary of the workspace's Stripe subscription, read on demand for
    # the Billing page (renewal date + whether it's set to lapse).
    status: str
    current_period_end: int | None  # unix seconds; None if Stripe omits it
    cancel_at_period_end: bool
