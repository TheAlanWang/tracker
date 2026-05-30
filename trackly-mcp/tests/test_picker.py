"""Provider picker HTML carries the OAuth parameters into both provider buttons."""

from trackly_mcp.oauth.picker import render_picker


def test_renders_both_provider_buttons():
    html = render_picker(
        request_id="req-abc",
        client_state="cs",
        client_challenge="cc",
        client_redirect_uri="http://127.0.0.1:1234/cb",
    )
    assert "Continue with GitHub" in html
    assert "Continue with Google" in html
    assert "req-abc" in html
    assert "provider=github" in html
    assert "provider=google" in html


def test_html_escapes_input():
    html = render_picker(
        request_id="<script>alert(1)</script>",
        client_state="x",
        client_challenge="y",
        client_redirect_uri="http://127.0.0.1:1/cb",
    )
    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;" in html
