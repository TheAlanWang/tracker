"""HTML for the provider picker page (/authorize).

This is the only HTML in the codebase. We hand-render rather than pull in a
template engine; nothing dynamic is happening that warrants Jinja2.

Each button is a link to /authorize/start?request_id=<...>&provider=<...>.
The request_id is an opaque token the server uses to look up the
client_state / client_challenge / client_redirect_uri it stashed when
the picker was first rendered.
"""

from html import escape


_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Sign in to Trackly</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #fafafa;
      color: #222;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }}
    .card {{
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.06);
      padding: 32px;
      max-width: 360px;
      width: 100%;
    }}
    h1 {{
      font-size: 18px;
      margin: 0 0 4px;
    }}
    .sub {{
      font-size: 13px;
      color: #666;
      margin-bottom: 24px;
    }}
    a.btn {{
      display: block;
      text-align: center;
      padding: 10px 16px;
      margin-bottom: 8px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 500;
      font-size: 14px;
    }}
    a.github {{ background: #24292f; color: #fff; }}
    a.google {{ background: #fff; color: #222; border: 1px solid #d0d7de; }}
  </style>
</head>
<body>
  <div class="card">
    <h1>Sign in to Trackly</h1>
    <p class="sub">Connect your Claude / Cursor MCP client to Trackly.</p>
    <a class="btn github" href="/authorize/start?request_id={request_id}&provider=github">Continue with GitHub</a>
    <a class="btn google" href="/authorize/start?request_id={request_id}&provider=google">Continue with Google</a>
  </div>
</body>
</html>
"""


def render_picker(
    request_id: str,
    client_state: str,
    client_challenge: str,
    client_redirect_uri: str,
) -> str:
    """client_state / client_challenge / client_redirect_uri are unused in HTML
    (they live in the server-side state dict under request_id). Kept in signature
    to document what request_id points to."""
    return _TEMPLATE.format(request_id=escape(request_id, quote=True))
