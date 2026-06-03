import logging
import os

import stripe
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from postgrest.exceptions import APIError

logger = logging.getLogger("app")

from app.routers import activity, billing, charts, checklist, comments, dependencies, tasks, goals, invitations, labels, me, members, notifications, projects, resolve, search, sprints, watchers, workspaces

app = FastAPI(title="tracker-api")

# Comma-separated list of allowed origins. Local dev defaults keep `pnpm dev`
# working out of the box; in production set CORS_ORIGINS to your deployed
# frontend URL (e.g. "https://tracker.vercel.app,https://tracker-pr-*.vercel.app").
_default_origins = "http://127.0.0.1:5173,http://localhost:5173"
_cors_origins = [
    o.strip() for o in os.getenv("CORS_ORIGINS", _default_origins).split(",") if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(APIError)
async def handle_postgrest_apierror(request, exc: APIError):
    """Translate auth.users FK violations into 401 so stale-session clients are bounced to /login.

    When supabase db reset wipes auth.users, the user's JWT remains cryptographically
    valid (the secret didn't change) but the referenced user row is gone. Any INSERT
    that carries a FK into auth.users (owner_id, user_id, reporter_id …) raises
    Postgres error code 23503 with details containing 'table "users"'.

    We have no public.users table, so any 23503 whose details mention 'table "users"'
    must be the auth.users FK. Matching on just "users" (not "auth.users") is correct
    because Postgres reports the unqualified table name in the details string.
    """
    details = (exc.details or "").lower()
    message = (exc.message or "").lower()
    combined = details + " " + message
    if exc.code == "23503" and 'table "users"' in combined:
        return JSONResponse(
            status_code=401,
            content={"detail": "Authenticated user no longer exists. Please sign in again."},
        )
    # Re-raise so FastAPI's default error handler returns 500 for unrelated DB errors.
    raise exc


@app.exception_handler(stripe.error.StripeError)
async def handle_stripe_error(request, exc: stripe.error.StripeError):
    """Turn any failed Stripe API call into a clean, CORS-safe 502.

    Without this, a StripeError (inactive/wrong price, bad key, Stripe outage)
    escapes the billing routes uncaught and propagates PAST CORSMiddleware to
    the outer ServerErrorMiddleware. That produces a 500 with NO
    Access-Control-Allow-Origin header — which the browser then mis-reports as a
    CORS failure, completely hiding the real cause (this is exactly how an
    "inactive price" looked like a CORS bug in the console).

    Handled here (inside ExceptionMiddleware, which sits inside CORSMiddleware)
    the response DOES get CORS headers. We log the full Stripe message
    server-side for debugging but return a generic detail so we never leak
    price IDs / customer IDs / other internals to the browser.
    """
    logger.error("Stripe API call failed: %s", exc, exc_info=True)
    return JSONResponse(
        status_code=502,
        content={"detail": "Payment provider error. Please try again later."},
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(activity.router)
app.include_router(billing.router)
app.include_router(charts.router)
app.include_router(checklist.router)
app.include_router(comments.router)
app.include_router(dependencies.router)
app.include_router(tasks.router)
app.include_router(goals.router)
app.include_router(labels.router)
app.include_router(me.router)
app.include_router(notifications.router)
app.include_router(workspaces.router)
app.include_router(members.router)
app.include_router(invitations.router)
app.include_router(projects.router)
app.include_router(resolve.router)
app.include_router(search.router)
app.include_router(sprints.router)
app.include_router(watchers.router)
