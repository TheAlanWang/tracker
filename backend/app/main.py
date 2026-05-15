from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from postgrest.exceptions import APIError

from app.routers import activity, comments, issues, labels, me, members, notifications, projects, resolve, search, sprints, workspaces

app = FastAPI(title="tracker-api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
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


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(activity.router)
app.include_router(comments.router)
app.include_router(issues.router)
app.include_router(labels.router)
app.include_router(me.router)
app.include_router(notifications.router)
app.include_router(workspaces.router)
app.include_router(members.router)
app.include_router(projects.router)
app.include_router(resolve.router)
app.include_router(search.router)
app.include_router(sprints.router)
