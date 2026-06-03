from unittest.mock import patch

import stripe


async def test_checkout_requires_auth(client):
    response = client.post("/billing/checkout", json={"workspace_id": "ws-1"})
    assert response.status_code == 401


async def test_stripe_error_becomes_clean_502_not_500(client, make_token):
    """A StripeError must NOT escape as a bare 500.

    Regression: an archived ("inactive") price made Checkout raise
    stripe.error.InvalidRequestError. Uncaught, it produced a 500 with no CORS
    header, which the browser mis-reported as a CORS failure. The global
    handler should turn it into a 502 with a generic, internals-free detail.
    """
    err = stripe.error.InvalidRequestError(
        "The price specified is inactive. This field only accepts active prices.",
        "line_items",
    )
    with patch("app.routers.billing.create_checkout", side_effect=err):
        token = make_token()
        response = client.post(
            "/billing/checkout",
            json={"workspace_id": "ws-1"},
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 502
    # Generic message only — Stripe internals (e.g. "inactive", price ids) must
    # not leak to the browser.
    assert "inactive" not in response.text.lower()
    assert response.json()["detail"]


async def test_stripe_error_response_carries_cors_header(client, make_token):
    """The 502 must pass back through CORSMiddleware (the original bug was the
    missing Access-Control-Allow-Origin header on the error response)."""
    err = stripe.error.StripeError("boom")
    origin = "http://localhost:5173"  # in the default dev allow-list
    with patch("app.routers.billing.create_checkout", side_effect=err):
        token = make_token()
        response = client.post(
            "/billing/checkout",
            json={"workspace_id": "ws-1"},
            headers={"Authorization": f"Bearer {token}", "Origin": origin},
        )

    assert response.status_code == 502
    assert response.headers.get("access-control-allow-origin") == origin
