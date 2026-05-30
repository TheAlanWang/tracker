"""Per-request contextvars. Set by middleware, read by client.py.

Replaces v1's "mint a JWT every call" with "forward the verified bearer the
client already gave us". This is the spine of the multi-tenant model: every
async task gets its own bearer, no globals.
"""

from contextvars import ContextVar
from dataclasses import dataclass

CURRENT_BEARER: ContextVar[str] = ContextVar("CURRENT_BEARER")
CURRENT_USER_ID: ContextVar[str] = ContextVar("CURRENT_USER_ID")


@dataclass
class ContextTokens:
    bearer: object
    user_id: object


def set_request_context(bearer: str, user_id: str) -> ContextTokens:
    """Set both vars; returns reset tokens for the caller to restore on exit."""
    return ContextTokens(
        bearer=CURRENT_BEARER.set(bearer),
        user_id=CURRENT_USER_ID.set(user_id),
    )


def get_bearer() -> str:
    """Read the current request's bearer. Raises LookupError if not set."""
    return CURRENT_BEARER.get()


def get_user_id() -> str:
    """Read the current request's user_id. Raises LookupError if not set."""
    return CURRENT_USER_ID.get()
