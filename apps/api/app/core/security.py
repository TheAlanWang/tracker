import jwt
from jwt import InvalidTokenError as PyJWTInvalidTokenError


class InvalidTokenError(Exception):
    """Raised when JWT verification fails for any reason."""


def verify_and_decode_supabase_jwt(token: str, jwt_secret: str) -> dict:
    """Verify a Supabase-issued JWT and return its full payload.

    Raises InvalidTokenError on any verification failure.
    """
    try:
        return jwt.decode(
            token,
            jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except PyJWTInvalidTokenError as exc:
        raise InvalidTokenError(str(exc)) from exc


def verify_supabase_jwt(token: str, jwt_secret: str) -> str:
    """Verify a Supabase-issued JWT and return the user_id (sub claim).

    Raises InvalidTokenError on any failure: bad signature, expired,
    missing sub, malformed, wrong audience.
    """
    payload = verify_and_decode_supabase_jwt(token, jwt_secret)
    user_id = payload.get("sub")
    if not user_id:
        raise InvalidTokenError("token missing 'sub' claim")

    return user_id
