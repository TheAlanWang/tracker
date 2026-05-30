from pydantic import BaseModel


class CheckoutRequest(BaseModel):
    workspace_id: str


class PortalRequest(BaseModel):
    workspace_id: str


class BillingUrlResponse(BaseModel):
    # A Stripe-hosted URL (Checkout or Billing Portal) the client redirects to.
    url: str
