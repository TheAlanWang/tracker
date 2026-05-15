from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import me, members, workspaces

app = FastAPI(title="tracker-api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(me.router)
app.include_router(workspaces.router)
app.include_router(members.router)
