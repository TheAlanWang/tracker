from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.core.deps import get_current_user_id


def _make_app() -> FastAPI:
    app = FastAPI()

    @app.get("/whoami")
    def whoami(user_id: str = Depends(get_current_user_id)):
        return {"user_id": user_id}

    return app


def test_deps_returns_user_id_for_valid_token(make_token):
    app = _make_app()
    client = TestClient(app)
    token = make_token(sub="alice")

    response = client.get("/whoami", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json() == {"user_id": "alice"}


def test_deps_returns_401_when_no_header():
    app = _make_app()
    client = TestClient(app)

    response = client.get("/whoami")

    assert response.status_code == 401


def test_deps_returns_401_when_bad_token():
    app = _make_app()
    client = TestClient(app)

    response = client.get("/whoami", headers={"Authorization": "Bearer not-a-token"})

    assert response.status_code == 401
