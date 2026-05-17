// VelocityChart — bar chart of completed-vs-total tasks per closed sprint.
// Sized for the SprintList sidebar / project overview. Sprints sorted
// oldest-on-the-left so the rightmost bars represent the most recent
// velocity readings — the only useful direction for trend reading.

import { useVelocity } from "@/features/charts/api";

const W = 480;
const H = 180;
const PAD = { left: 28, right: 12, top: 12, bottom: 38 };

export function VelocityChart({ projectId }: { projectId: string }) {
  const { data, isLoading } = useVelocity(projectId);

  if (isLoading) return <p className="text-sm text-slate-400 dark:text-slate-500">Loading velocity…</p>;
  if (!data || data.bars.length === 0) {
    return (
      <p className="text-sm text-slate-400 dark:text-slate-500">
        No completed sprints yet. Velocity appears once you complete a sprint.
      </p>
    );
  }

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const yMax = Math.max(1, ...data.bars.map((b) => b.total));
  const slot = innerW / data.bars.length;
  const barW = Math.min(slot * 0.55, 36);
  const yTicks = [0, Math.round(yMax / 2), yMax];

  // Average for the dashed reference line. Excludes sprints with zero total
  // since those visually distort the average.
  const nonEmpty = data.bars.filter((b) => b.total > 0);
  const avgCompleted = nonEmpty.length
    ? nonEmpty.reduce((s, b) => s + b.completed, 0) / nonEmpty.length
    : 0;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      role="img"
      aria-label="Velocity chart"
    >
      {yTicks.map((t) => {
        const y = PAD.top + innerH - (t / yMax) * innerH;
        return (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="2 4" />
            <text x={PAD.left - 6} y={y + 3} fontSize="10" textAnchor="end" fill="#64748b">
              {t}
            </text>
          </g>
        );
      })}

      {data.bars.map((b, i) => {
        const cx = PAD.left + slot * (i + 0.5);
        const totalH = (b.total / yMax) * innerH;
        const compH = (b.completed / yMax) * innerH;
        return (
          <g key={b.sprint_id}>
            {/* Total (planned) bar — muted */}
            <rect
              x={cx - barW / 2}
              y={PAD.top + innerH - totalH}
              width={barW}
              height={totalH}
              fill="#e2e8f0"
              rx={2}
            />
            {/* Completed (delivered) bar — overlay */}
            <rect
              x={cx - barW / 2}
              y={PAD.top + innerH - compH}
              width={barW}
              height={compH}
              fill="#10b981"
              rx={2}
            />
            <text
              x={cx}
              y={H - PAD.bottom + 12}
              fontSize="10"
              textAnchor="middle"
              fill="#475569"
            >
              {b.sprint_name.length > 10
                ? b.sprint_name.slice(0, 9) + "…"
                : b.sprint_name}
            </text>
            <text
              x={cx}
              y={H - PAD.bottom + 25}
              fontSize="9"
              textAnchor="middle"
              fill="#94a3b8"
            >
              {b.completed}/{b.total}
            </text>
          </g>
        );
      })}

      {/* Average completion reference line */}
      {avgCompleted > 0 && (
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={PAD.top + innerH - (avgCompleted / yMax) * innerH}
          y2={PAD.top + innerH - (avgCompleted / yMax) * innerH}
          stroke="#10b981"
          strokeDasharray="3 3"
          opacity={0.6}
        />
      )}
    </svg>
  );
}
