"""Redirect-URI validation per security invariant #6."""

import pytest

from trackly_mcp.oauth.validators import (
    InvalidRedirectURI,
    validate_redirect_uri,
)


@pytest.mark.parametrize("uri", [
    "http://127.0.0.1/callback",
    "http://127.0.0.1:1234/callback",
    "http://127.0.0.1:65535/oauth/cb",
    "http://[::1]:9999/cb",
    "https://claude.ai/oauth/callback",
    "https://cursor.sh/cb",
])
def test_accepts_valid(uri):
    validate_redirect_uri(uri)  # no raise


@pytest.mark.parametrize("uri,reason", [
    ("http://example.com/cb", "non-loopback http"),
    ("http://malicious.test/cb", "non-loopback http"),
    ("ftp://example.com/cb", "non-http(s) scheme"),
    ("file:///etc/passwd", "non-http(s) scheme"),
    ("javascript:alert(1)", "non-http(s) scheme"),
    ("data:text/html,foo", "non-http(s) scheme"),
    ("https://example.com/cb#frag", "fragment present"),
    ("not-a-url", "no scheme"),
    ("", "empty"),
])
def test_rejects_invalid(uri, reason):
    with pytest.raises(InvalidRedirectURI):
        validate_redirect_uri(uri)


def test_allows_http_localhost():
    """localhost is treated as loopback — MCP clients use http://localhost callbacks."""
    validate_redirect_uri("http://localhost:1234/cb")
