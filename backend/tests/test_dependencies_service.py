"""Cycle-detection tests for the task-dependency service.

The interesting part is `_would_create_cycle`: given a proposed
(blocker, blocked) edge, does the current dependency graph already
contain a path from `blocked` back to `blocker`? If yes, adding the
new edge would close a cycle.

We isolate the BFS by mocking the supabase client to return a fixed
adjacency map keyed by blocker → [blocked_task_ids], so each test
exercises the algorithm against a specific graph shape.
"""

from unittest.mock import MagicMock

from app.services.dependencies import _would_create_cycle


def _supabase_with_edges(edges: dict[str, list[str]]) -> MagicMock:
    """Build a stub supabase client whose `task_dependencies` table
    returns rows according to an adjacency map.

    The real call chain is:
        supabase.table("task_dependencies")
                .select("blocked_task_id")
                .eq("blocker_task_id", cur)
                .execute()
                .data
    We intercept `.eq("blocker_task_id", <cur>)` and dispatch based on
    `cur` so each node in the BFS sees its own outgoing edges.
    """
    sb = MagicMock()

    def on_eq(field: str, value: str):
        result = MagicMock()
        result.execute.return_value.data = [
            {"blocked_task_id": b} for b in edges.get(value, [])
        ]
        return result

    chain = MagicMock()
    chain.select.return_value.eq.side_effect = on_eq
    sb.table.return_value = chain
    return sb


def test_two_node_cycle_detected():
    """A → B exists, adding B → A would close the loop."""
    sb = _supabase_with_edges({"A": ["B"]})
    assert _would_create_cycle(sb, blocker_id="B", blocked_id="A") is True


def test_three_node_cycle_detected():
    """A → B → C exists, adding C → A would close a 3-node ring."""
    sb = _supabase_with_edges({"A": ["B"], "B": ["C"]})
    assert _would_create_cycle(sb, blocker_id="C", blocked_id="A") is True


def test_longer_chain_cycle_detected():
    """A → B → C → D exists, adding D → A would close a 4-node ring."""
    sb = _supabase_with_edges({"A": ["B"], "B": ["C"], "C": ["D"]})
    assert _would_create_cycle(sb, blocker_id="D", blocked_id="A") is True


def test_diamond_cycle_detected():
    """A → B, A → C, B → D, C → D exist. D → A would close two cycles
    at once; the BFS terminates the moment it reaches A from any path."""
    sb = _supabase_with_edges(
        {"A": ["B", "C"], "B": ["D"], "C": ["D"]},
    )
    assert _would_create_cycle(sb, blocker_id="D", blocked_id="A") is True


def test_no_cycle_when_disjoint():
    """A → B and C → D exist. Adding E → F (no overlap) is safe."""
    sb = _supabase_with_edges({"A": ["B"], "C": ["D"]})
    assert _would_create_cycle(sb, blocker_id="E", blocked_id="F") is False


def test_no_cycle_when_forward_only():
    """A → B exists. Adding B → C extends the chain but doesn't loop."""
    sb = _supabase_with_edges({"A": ["B"]})
    assert _would_create_cycle(sb, blocker_id="B", blocked_id="C") is False


def test_existing_cycle_in_data_does_not_hang():
    """Defensive: if the table somehow already contains a cycle (e.g.
    A → B → A), the visited set should still terminate the BFS instead
    of looping forever."""
    sb = _supabase_with_edges({"A": ["B"], "B": ["A"]})
    # Adding C → A walks A → B → A; visited stops it. No path reaches C
    # so the result is False (no NEW cycle introduced by C → A).
    assert _would_create_cycle(sb, blocker_id="C", blocked_id="A") is False
