FROM python:3.12-slim

WORKDIR /app

# uv: fast Python package installer. We use the same lockfile we use locally
# (uv.lock) so the production image gets byte-identical deps.
RUN pip install --no-cache-dir uv

# Copy lockfile + pyproject first so dependency installs can be Docker-cached
# across rebuilds where only application code changed.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Application code in a separate layer so code edits don't invalidate the
# dep-install layer.
COPY app ./app

# uv creates the venv at /app/.venv — put its python first on PATH so
# `uvicorn` resolves correctly.
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
