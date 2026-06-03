from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from supabase import AsyncClient

from app.core.config import Settings, get_settings
from app.core.deps import get_current_user_id, get_supabase_admin
from app.schemas.agent import AgentRequest
from app.services import agent_store
from app.services.agent import run_agent_stream
from app.services.usage import AgentQuotaExceededError, consume_agent_message

router = APIRouter(tags=["agent"])


async def _project_and_membership(
    supabase: AsyncClient, *, user_id: str, project_id: str
) -> dict:
    """Fetch the project row and assert the caller is a workspace member.

    Mirrors the membership pattern in services/tasks.py; raises HTTP 404 if
    the project is gone, 403 if the caller isn't a member.
    """
    rows = (
        await supabase.table("projects")
        .select("*")
        .eq("id", project_id)
        .limit(1)
        .execute()
    ).data
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    project = rows[0]
    member = (
        await supabase.table("workspace_members")
        .select("role")
        .eq("workspace_id", project["workspace_id"])
        .eq("user_id", user_id)
        .execute()
    ).data
    if not member:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    return project


@router.post("/projects/{p_id}/agent")
async def agent(
    p_id: str,
    payload: AgentRequest,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
    settings: Settings = Depends(get_settings),
):
    # AI not configured on this deployment → graceful 503 (mirrors billing).
    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI assistant is not configured",
        )

    project = await _project_and_membership(
        supabase, user_id=user_id, project_id=p_id
    )

    # Meter one agent turn BEFORE streaming — once the StreamingResponse
    # starts we can no longer change the HTTP status, so quota is enforced
    # here and an over-cap workspace gets a real 402.
    try:
        usage = await consume_agent_message(
            supabase, workspace_id=project["workspace_id"]
        )
    except AgentQuotaExceededError as exc:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "message": "You're out of AI assistant messages for this month.",
                "plan": exc.plan,
                "cap": exc.cap,
                "used": exc.used,
            },
        ) from exc

    ws_slug = (
        await supabase.table("workspaces")
        .select("slug")
        .eq("id", project["workspace_id"])
        .limit(1)
        .execute()
    ).data
    slug = ws_slug[0]["slug"] if ws_slug else ""

    return StreamingResponse(
        run_agent_stream(
            supabase,
            settings,
            user_id=user_id,
            project=project,
            ws_slug=slug,
            thread=payload.messages,
            usage=usage,
            focus_task=payload.focus_task,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/projects/{p_id}/agent/history")
async def history(
    p_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    """Load this user's saved conversation for the project (for seeding the
    panel on open). Returns {messages: [{role, content}, ...]}."""
    await _project_and_membership(supabase, user_id=user_id, project_id=p_id)
    messages = await agent_store.load_conversation(
        supabase, project_id=p_id, user_id=user_id
    )
    return {"messages": messages}


@router.delete("/projects/{p_id}/agent/history", status_code=status.HTTP_204_NO_CONTENT)
async def clear_history(
    p_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: AsyncClient = Depends(get_supabase_admin),
):
    """Clear this user's saved conversation for the project (the panel's
    "Clear chat"). Does NOT touch long-term memory."""
    await _project_and_membership(supabase, user_id=user_id, project_id=p_id)
    await agent_store.clear_conversation(supabase, project_id=p_id, user_id=user_id)
