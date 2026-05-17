// GoalPicker — Select dropdown listing every goal in a workspace, indented
// by depth so the hierarchy reads at a glance. Used in TaskDetail's aside
// (matches the SprintPicker pattern — a wrapped <Select>). When the user
// picks "(no goal)" we send null up; otherwise the goal's id.

import { useMemo } from "react";

import { Select } from "@/components/ui/select";
import { useGoals } from "@/features/goals/api";

export function GoalPicker({
  value,
  onChange,
  workspaceId,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  workspaceId: string;
}) {
  const { data: goals = [] } = useGoals(workspaceId);

  // Build options in tree order with indentation. We walk children of each
  // parent recursively so siblings stay adjacent and the indent reflects
  // depth. Done once per goals[] change.
  const options = useMemo(() => {
    const childrenByParent = new Map<string | null, typeof goals>();
    for (const g of goals) {
      const arr = childrenByParent.get(g.parent_goal_id) ?? [];
      arr.push(g);
      childrenByParent.set(g.parent_goal_id, arr);
    }
    for (const arr of childrenByParent.values()) {
      arr.sort((a, b) => a.position - b.position);
    }
    const out: { value: string; label: string }[] = [
      { value: "", label: "(no goal)" },
    ];
    const walk = (parentId: string | null, depth: number) => {
      const kids = childrenByParent.get(parentId) ?? [];
      for (const g of kids) {
        // Indent with non-breaking spaces — the shadcn Select preserves them.
        const indent = "  ".repeat(depth);
        out.push({ value: g.id, label: `${indent}${g.title}` });
        walk(g.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [goals]);

  return (
    <Select
      value={value ?? ""}
      onChange={(v) => onChange(v === "" ? null : v)}
      options={options}
    />
  );
}

export function findGoalById(
  goals: { id: string; title: string }[],
  id: string | null,
): string | null {
  if (!id) return null;
  return goals.find((g) => g.id === id)?.title ?? null;
}
