"""Latency benchmark for any tracker-api endpoint.

Targets either prod (Fly) or local dev. Picks a real user from the database,
mints an HS256 JWT signed with the project's SUPABASE_JWT_SECRET so the
request passes auth + RLS, hits the endpoint N times (optionally concurrent),
prints p50/p90/p95/p99/min/max/mean.

Usage:
  # against prod (default)
  APP_ENV=prd uv run python -m scripts.bench --endpoint /me/dashboard --count 100

  # against local dev
  APP_ENV=dev uv run python -m scripts.bench --url http://127.0.0.1:8000 \
    --endpoint /me/dashboard --count 100

  # higher concurrency to simulate load
  APP_ENV=prd uv run python -m scripts.bench --count 100 --concurrency 5

Notes:
  - `--count` requests in total. `--concurrency` = how many run in parallel.
    Sequential (concurrency=1) measures per-request latency; concurrent shows
    server-side queueing behavior.
  - The script picks the first user found in any workspace, then auto-appends
    `?workspace_id=<that-workspace>` to the endpoint if not already present.
"""

import argparse
import asyncio
import statistics
import time
from typing import Iterable

import httpx
import jwt

from app.core.config import get_settings
from app.db.supabase import get_supabase_admin


def mint_user_jwt(user_id: str, jwt_secret: str, ttl_seconds: int = 3600) -> str:
    """Mint an HS256 JWT shaped like a Supabase user-session token."""
    now = int(time.time())
    payload = {
        "sub": user_id,
        "aud": "authenticated",
        "iat": now,
        "exp": now + ttl_seconds,
    }
    return jwt.encode(payload, jwt_secret, algorithm="HS256")


def pick_test_user_and_workspace(supabase) -> tuple[str, str]:
    """Return (user_id, workspace_id) for the first user who is a member of
    any workspace. Stable choice across runs so benchmark conditions stay
    constant — first row order from auth.admin.list_users() is by created_at."""
    users = supabase.auth.admin.list_users()
    for user in users:
        rows = (
            supabase.table("workspace_members")
            .select("workspace_id")
            .eq("user_id", user.id)
            .limit(1)
            .execute()
            .data
        )
        if rows:
            return user.id, rows[0]["workspace_id"]
    raise RuntimeError("No user found in any workspace — sign up + create one first")


def percentile(sorted_values: list[float], p: float) -> float:
    """Linear-interpolated percentile. `sorted_values` must already be sorted."""
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return sorted_values[0]
    k = (len(sorted_values) - 1) * (p / 100.0)
    lo = int(k)
    hi = min(lo + 1, len(sorted_values) - 1)
    return sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (k - lo)


def report(label: str, times: list[float], errors: list[tuple[int, str]]) -> None:
    if not times:
        print(f"\n{label}: 0 successful samples ({len(errors)} errors)")
        for code, body in errors[:3]:
            print(f"  → {code}: {body[:120]}")
        return

    sorted_t = sorted(times)
    n = len(times)
    print(f"\n=== {label} ===")
    print(f"  samples:    {n}  (errors: {len(errors)})")
    print(f"  min:        {min(sorted_t) * 1000:7.1f} ms")
    print(f"  p50:        {percentile(sorted_t, 50) * 1000:7.1f} ms")
    print(f"  p90:        {percentile(sorted_t, 90) * 1000:7.1f} ms")
    print(f"  p95:        {percentile(sorted_t, 95) * 1000:7.1f} ms")
    print(f"  p99:        {percentile(sorted_t, 99) * 1000:7.1f} ms")
    print(f"  max:        {max(sorted_t) * 1000:7.1f} ms")
    print(f"  mean:       {statistics.mean(sorted_t) * 1000:7.1f} ms")
    if errors:
        for code, body in errors[:3]:
            print(f"  → first error {code}: {body[:100]}")


async def run(
    url: str,
    headers: dict[str, str],
    count: int,
    concurrency: int,
) -> tuple[list[float], list[tuple[int, str]]]:
    sem = asyncio.Semaphore(concurrency)
    times: list[float] = []
    errors: list[tuple[int, str]] = []

    async with httpx.AsyncClient(timeout=60.0) as client:
        # Warm up: one untimed request so DNS / TLS handshake costs don't
        # land on sample #1.
        try:
            await client.get(url, headers=headers)
        except Exception:
            pass

        async def one() -> None:
            async with sem:
                start = time.perf_counter()
                try:
                    r = await client.get(url, headers=headers)
                except Exception as exc:
                    errors.append((0, repr(exc)))
                    return
                elapsed = time.perf_counter() - start
                if r.status_code == 200:
                    times.append(elapsed)
                else:
                    errors.append((r.status_code, r.text))

        await asyncio.gather(*[one() for _ in range(count)])

    return times, errors


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--url",
        default="https://api.gettrackly.dev",
        help="Base URL of the API. Defaults to prod (Railway).",
    )
    ap.add_argument(
        "--endpoint",
        default="/me/dashboard",
        help="Path to hit. Workspace_id is auto-appended if absent.",
    )
    ap.add_argument("--count", type=int, default=100)
    ap.add_argument("--concurrency", type=int, default=1)
    args = ap.parse_args()

    settings = get_settings()
    admin_supabase = get_supabase_admin()

    user_id, workspace_id = pick_test_user_and_workspace(admin_supabase)
    print(f"User:      {user_id[:8]}…  ({admin_supabase.auth.admin.get_user_by_id(user_id).user.email if False else 'masked'})")
    print(f"Workspace: {workspace_id[:8]}…")

    token = mint_user_jwt(user_id, settings.supabase_jwt_secret)

    target = args.url.rstrip("/") + args.endpoint
    if "workspace_id" not in target:
        target += ("&" if "?" in target else "?") + f"workspace_id={workspace_id}"

    print(f"Target:    {target}")
    print(f"Count:     {args.count}    Concurrency: {args.concurrency}")

    headers = {"Authorization": f"Bearer {token}"}
    times, errors = asyncio.run(run(target, headers, args.count, args.concurrency))
    report(f"{args.endpoint} (count={args.count}, conc={args.concurrency})", times, errors)


if __name__ == "__main__":
    main()
