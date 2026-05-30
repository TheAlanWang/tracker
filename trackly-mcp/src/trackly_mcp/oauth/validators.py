"""Redirect-URI policy enforcer (security invariant #6).

Rules:
- scheme must be http or https
- non-loopback hosts: https only
- loopback (127.0.0.1, [::1], localhost) on any port: http allowed
- no fragments

RFC 8252 §7.3 prefers the literal loopback IP, but real MCP clients
(Claude Desktop / Code, Cursor) commonly register `http://localhost:PORT`
callbacks, so we accept `localhost` as loopback too.
"""

from urllib.parse import urlparse


class InvalidRedirectURI(ValueError):
    pass


_LOOPBACK_HOSTS = frozenset({"127.0.0.1", "::1", "localhost"})


def validate_redirect_uri(uri: str) -> None:
    """Raise InvalidRedirectURI on policy violation. Return None on success."""
    if not uri:
        raise InvalidRedirectURI("empty redirect_uri")

    parsed = urlparse(uri)

    if parsed.scheme not in ("http", "https"):
        raise InvalidRedirectURI(f"scheme {parsed.scheme!r} not allowed")

    if not parsed.hostname:
        raise InvalidRedirectURI("missing host")

    if parsed.fragment:
        raise InvalidRedirectURI("fragment not allowed")

    host = parsed.hostname  # urlparse strips brackets from [::1]

    if parsed.scheme == "http" and host not in _LOOPBACK_HOSTS:
        raise InvalidRedirectURI(
            f"http only allowed for loopback (127.0.0.1, [::1]); got {host!r}"
        )
