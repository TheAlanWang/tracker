"""Persistence for the AI agent: conversation history + long-term memory.

Two grains (see migration 20260602160000_agent_persistence.sql):
  - conversation history: per (project, user) — one ongoing thread per board.
  - long-term memory: per (workspace, user) — durable facts that follow the
    user across projects within a workspace, never across workspaces.

All functions take the per-user (RLS-scoped) Supabase client and are called
only after the router has verified membership. Best-effort by design — a
persistence hiccup must never break the live chat, so callers wrap these in
try/except where appropriate.
"""

from datetime import datetime, timezone

from supabase import AsyncClient

# Keep the stored thread bounded — we only ever need recent context, and the
# frontend caps what it sends too.
_MAX_STORED_MESSAGES = 60
# Cap long-term facts so the system prompt can't grow without bound.
_MAX_MEMORY_FACTS = 40
_MAX_FACT_LEN = 280


# ── conversation history ───────────────────────────────────────────────────


async def load_conversation(
    supabase: AsyncClient, *, project_id: str, user_id: str
) -> list[dict]:
    rows = (
        await supabase.table("agent_conversations")
        .select("messages")
        .eq("project_id", project_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    ).data
    return rows[0]["messages"] if rows else []


async def save_conversation(
    supabase: AsyncClient,
    *,
    workspace_id: str,
    project_id: str,
    user_id: str,
    messages: list[dict],
) -> None:
    trimmed = messages[-_MAX_STORED_MESSAGES:]
    await (
        supabase.table("agent_conversations")
        .upsert(
            {
                "workspace_id": workspace_id,
                "project_id": project_id,
                "user_id": user_id,
                "messages": trimmed,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="project_id,user_id",
        )
        .execute()
    )


async def clear_conversation(
    supabase: AsyncClient, *, project_id: str, user_id: str
) -> None:
    await (
        supabase.table("agent_conversations")
        .delete()
        .eq("project_id", project_id)
        .eq("user_id", user_id)
        .execute()
    )


# ── long-term memory ─────────────────────────────────────────────────────────


async def load_memory(
    supabase: AsyncClient, *, workspace_id: str, user_id: str
) -> list[str]:
    rows = (
        await supabase.table("agent_memory")
        .select("content")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .order("created_at")
        .execute()
    ).data
    return [r["content"] for r in rows]


async def add_memory(
    supabase: AsyncClient, *, workspace_id: str, user_id: str, content: str
) -> None:
    content = content.strip()[:_MAX_FACT_LEN]
    if not content:
        return
    # Enforce the cap by dropping the oldest fact(s) to make room — keeps the
    # most recent understanding of the user.
    existing = (
        await supabase.table("agent_memory")
        .select("id")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .order("created_at")
        .execute()
    ).data
    overflow = len(existing) - (_MAX_MEMORY_FACTS - 1)
    for row in existing[:overflow] if overflow > 0 else []:
        await supabase.table("agent_memory").delete().eq("id", row["id"]).execute()

    await (
        supabase.table("agent_memory")
        .insert(
            {
                "workspace_id": workspace_id,
                "user_id": user_id,
                "content": content,
            }
        )
        .execute()
    )


async def clear_memory(
    supabase: AsyncClient, *, workspace_id: str, user_id: str
) -> None:
    await (
        supabase.table("agent_memory")
        .delete()
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .execute()
    )
