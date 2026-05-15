import time

import jwt
from jwt import InvalidTokenError as PyJWTInvalidTokenError
from jwt import PyJWKClient


class InvalidTokenError(Exception):
    """Raised when JWT verification fails for any reason."""


def _get_header_alg(token: str) -> str:
    """Return the 'alg' field from the JWT header without verifying."""
    try:
        header = jwt.get_unverified_header(token)
        return header.get("alg", "HS256")
    except Exception:
        return "HS256"


def verify_and_decode_supabase_jwt(token: str, jwt_secret: str) -> dict:
    """Verify a Supabase-issued JWT and return its full payload.

    Supports both HS256 (legacy/test) and ES256 (Supabase local dev v2+).
    Raises InvalidTokenError on any verification failure.
    """
    alg = _get_header_alg(token)
    try:
        if alg == "ES256":
            # Supabase local dev v2+ issues ES256 tokens; fetch the public key
            # from the JWKS endpoint that the Supabase auth server exposes.
            # jwt_secret contains SUPABASE_URL when ES256 is used.
            # We derive the JWKS URL from the token's issuer claim.
            unverified = jwt.decode(token, options={"verify_signature": False})
            iss = unverified.get("iss", "")
            # iss is e.g. "http://127.0.0.1:54321/auth/v1"
            jwks_url = iss.rstrip("/") + "/.well-known/jwks.json"
            jwks_client = PyJWKClient(jwks_url, cache_keys=True)
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            return jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256"],
                audience="authenticated",
            )
        else:
            return jwt.decode(
                token,
                jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
    except PyJWTInvalidTokenError as exc:
        raise InvalidTokenError(str(exc)) from exc


def mint_service_jwt_for_user(user_id: str, jwt_secret: str, ttl_seconds: int = 600) -> str:
    """Mint a short-lived service_role JWT that's also bound to a user.

    Used by the backend to call Supabase such that:
      - role=service_role → PostgREST bypasses RLS
      - sub=user_id       → triggers see auth.uid() = user_id (real actor)

    Signed with the same HS256 secret PostgREST verifies against.
    """
    now = int(time.time())
    payload = {
        "role": "service_role",
        "sub": user_id,
        "iat": now,
        "exp": now + ttl_seconds,
    }
    return jwt.encode(payload, jwt_secret, algorithm="HS256")


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
