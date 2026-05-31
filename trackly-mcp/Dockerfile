# syntax=docker/dockerfile:1.7
FROM python:3.13-slim AS builder

# uv for fast, locked installs
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app
ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_PYTHON_DOWNLOADS=never

# Install deps in a separate layer for cache efficiency
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

# Now the project source. README.md is required because pyproject.toml's
# `readme = "README.md"` is read by hatchling when it builds the package.
COPY src ./src
COPY README.md ./
RUN uv sync --frozen --no-dev

# ─── Runtime ────────────────────────────────────────────────────────
FROM python:3.13-slim

WORKDIR /app
COPY --from=builder /app /app

ENV PATH="/app/.venv/bin:$PATH" \
    PORT=8080

EXPOSE 8080
CMD ["trackly-mcp"]
