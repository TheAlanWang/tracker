// BurndownChart — inline SVG burndown for a single sprint. Two traces:
// an actual remaining-work step line (solid, blue) and an ideal straight
// line (dashed, slate). Why hand-rolled SVG instead of recharts/visx:
//   - One chart, simple shapes — a dependency cost would dwarf the code.
//   - Full control over the "today" marker, the empty/error states, and
//     the tooltip dot, none of which look polished in a generic chart lib
//     without significant config wrangling.

import { useState } from "react";

import { type Burndown, useBurndown } from "@/features/charts/api";

const W = 640;
const H = 220;
const PAD = { left: 36, right: 16, top: 16, bottom: 28 };

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function BurndownInner({ data }: { data: Burndown }) {
  const [hover, setHover] = useState<number | null>(null);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const yMax = Math.max(1, data.total);
  const xN = Math.max(1, data.points.length - 1);

  const x = (i: number) => PAD.left + (i / xN) * innerW;
  const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH;

  // Actual line: step shape so the chart reads as "snapshots at end of day".
  const actualPath = data.points
    .map((p, i) =>
      i === 0
        ? `M ${x(i)} ${y(p.remaining)}`
        : `L ${x(i)} ${y(data.points[i - 1]!.remaining)} L ${x(i)} ${y(p.remaining)}`,
    )
    .join(" ");

  // Ideal line: just connect first to last using the ideal values.
  const idealPath =
    data.points.length > 1
      ? `M ${x(0)} ${y(data.points[0]!.ideal)} L ${x(data.points.length - 1)} ${y(data.points[data.points.length - 1]!.ideal)}`
      : "";

  // Y axis ticks: 0, half, total. Keeps the chart legible without crowding.
  const yTicks = [0, Math.round(yMax / 2), yMax];

  // X axis ticks: show 4-6 evenly spaced day labels.
  const tickEvery = Math.max(1, Math.floor(data.points.length / 5));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      role="img"
      aria-label="Burndown chart"
    >
      {/* Y gridlines */}
      {yTicks.map((t) => (
        <g key={t}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(t)}
            y2={y(t)}
            stroke="#e2e8f0"
            strokeDasharray="2 4"
          />
          <text
            x={PAD.left - 6}
            y={y(t) + 3}
            fontSize="10"
            textAnchor="end"
            fill="#64748b"
          >
            {t}
          </text>
        </g>
      ))}

      {/* X axis labels */}
      {data.points.map((p, i) =>
        i % tickEvery === 0 || i === data.points.length - 1 ? (
          <text
            key={i}
            x={x(i)}
            y={H - PAD.bottom + 14}
            fontSize="10"
            textAnchor="middle"
            fill="#64748b"
          >
            {fmtDate(p.day)}
          </text>
        ) : null,
      )}

      {/* Ideal line */}
      <path
        d={idealPath}
        fill="none"
        stroke="#94a3b8"
        strokeWidth="1.5"
        strokeDasharray="4 4"
      />

      {/* Actual line */}
      <path d={actualPath} fill="none" stroke="#2563eb" strokeWidth="2" />

      {/* Hover hotspots — invisible rects, easier to hit than circles */}
      {data.points.map((p, i) => (
        <g key={i}>
          <rect
            x={x(i) - innerW / xN / 2}
            y={PAD.top}
            width={innerW / xN}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
          {hover === i && (
            <>
              <circle cx={x(i)} cy={y(p.remaining)} r={4} fill="#2563eb" />
              <rect
                x={Math.min(x(i) + 6, W - PAD.right - 110)}
                y={Math.max(y(p.remaining) - 32, PAD.top)}
                width={110}
                height={28}
                rx={4}
                fill="#0f172a"
              />
              <text
                x={Math.min(x(i) + 12, W - PAD.right - 104)}
                y={Math.max(y(p.remaining) - 17, PAD.top + 15)}
                fontSize="10"
                fill="white"
              >
                {fmtDate(p.day)} · {p.remaining} left
              </text>
            </>
          )}
        </g>
      ))}
    </svg>
  );
}

export function BurndownChart({ sprintId }: { sprintId: string }) {
  const { data, isLoading, error } = useBurndown(sprintId);

  if (isLoading) {
    return <p className="text-sm text-slate-400 dark:text-slate-500">Loading burndown…</p>;
  }

  // The most useful failure mode: sprint has no dates. We surface that
  // directly so the user knows the fix is "set start/end dates".
  if (error) {
    const detail =
      (error as { response?: { data?: { detail?: string } } }).response?.data
        ?.detail ?? "Could not load burndown.";
    return <p className="text-sm text-slate-500 dark:text-slate-400">{detail}</p>;
  }
  if (!data || data.total === 0) {
    return (
      <p className="text-sm text-slate-400 dark:text-slate-500">
        No tasks in this sprint yet. Add tasks to see a burndown.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400 mb-2">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-0.5 bg-blue-600" /> Actual
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-0.5 bg-slate-400"
            style={{ borderTop: "2px dashed #94a3b8" }}
          />{" "}
          Ideal
        </span>
        <span className="ml-auto text-slate-400 dark:text-slate-500">{data.total} tasks total</span>
      </div>
      <BurndownInner data={data} />
    </div>
  );
}
