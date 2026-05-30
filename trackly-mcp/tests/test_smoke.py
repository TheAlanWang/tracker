"""Smoke tests — verify the package imports and FastMCP wires up.

Real end-to-end is covered by manually pointing Claude Code at the running
server (see README) and by the per-module unit tests.
"""

from trackly_mcp.server import mcp


def test_fastmcp_instance_imports():
    assert mcp is not None
    assert mcp.name == "trackly"


def test_tools_registered():
    """All tools should be on the FastMCP instance."""
    # FastMCP exposes tools via mcp._tool_manager — name varies by mcp version;
    # the resilient check is asking it to list:
    import asyncio
    tools = asyncio.get_event_loop().run_until_complete(mcp.list_tools())
    names = {t.name for t in tools}
    expected = {
        "list_workspaces", "list_projects", "list_my_tasks", "get_task", "search",
        "list_sprints", "list_tasks", "list_workspace_members",
        "list_recent_activity", "get_project",
        "create_task", "update_task", "add_comment",
        "list_checklist", "add_checklist_item", "set_checklist_item",
        "delete_checklist_item",
    }
    assert expected.issubset(names), f"missing: {expected - names}"
    # The seven single-field setters are now folded into update_task.
    removed = {
        "update_task_status", "update_task_title", "update_task_description",
        "set_due_date", "set_priority", "assign_task", "move_to_sprint",
    }
    assert not (removed & names), f"should be gone: {removed & names}"
