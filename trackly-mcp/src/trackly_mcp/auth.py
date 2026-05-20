"""HS256 user-JWT minting — same shape as a Supabase session token.

Shared secret with the backend (`SUPABASE_JWT_SECRET`); backend's
`verify_supabase_jwt` accepts these tokens just like real Supabase ones.

Cribbed from `backend/scripts/bench.py:mint_user_jwt` — same fields,
same algorithm, so the backend can't tell the difference between a
token minted here and one a browser session would carry.
"""

import time

import jwt


def mint_user_jwt(user_id: str, jwt_secret: str, ttl_seconds: int = 3600) -> str:
    now = int(time.time())
    payload = {
        "sub": user_id,
        "aud": "authenticated",
        "iat": now,
        "exp": now + ttl_seconds,
    }
    return jwt.encode(payload, jwt_secret, algorithm="HS256")
