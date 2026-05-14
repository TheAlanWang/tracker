import time

import jwt
import pytest

from app.core.security import InvalidTokenError, verify_supabase_jwt

JWT_SECRET = "test-secret-key"


def make_token(sub: str = "user-123", exp_offset: int = 3600, **extra) -> str:
    payload = {
        "sub": sub,
        "exp": int(time.time()) + exp_offset,
        "iat": int(time.time()),
        "aud": "authenticated",
        **extra,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def test_verify_valid_token_returns_user_id():
    token = make_token(sub="user-abc")
    assert verify_supabase_jwt(token, JWT_SECRET) == "user-abc"


def test_verify_expired_token_raises():
    token = make_token(exp_offset=-10)
    with pytest.raises(InvalidTokenError):
        verify_supabase_jwt(token, JWT_SECRET)


def test_verify_token_with_wrong_secret_raises():
    token = make_token()
    with pytest.raises(InvalidTokenError):
        verify_supabase_jwt(token, "wrong-secret")


def test_verify_token_without_sub_raises():
    payload = {
        "exp": int(time.time()) + 3600,
        "iat": int(time.time()),
        "aud": "authenticated",
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    with pytest.raises(InvalidTokenError):
        verify_supabase_jwt(token, JWT_SECRET)
