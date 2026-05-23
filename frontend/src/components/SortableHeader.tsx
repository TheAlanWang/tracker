import type { SortField, SortState } from "@/features/tasks/filters";

type Props = {
  field: SortField;
  label: string;
  sort: SortState;
  onSortChange: (next: SortState) => void;
};

// Column header that doubles as a sort toggle. Click cycles:
//   inactive → asc → desc → inactive
// The arrow indicator is hidden on inactive columns until hover so column
// headers don't get visually noisy.
export function SortableHeader({ field, label, sort, onSortChange }: Props) {
  const isActive = sort?.field === field;
  const arrow = isActive ? (sort!.direction === "asc" ? "↑" : "↓") : "↕";

  const onClick = () => {
    if (!isActive) {
      onSortChange({ field, direction: "asc" });
    } else if (sort!.direction === "asc") {
      onSortChange({ field, direction: "desc" });
    } else {
      onSortChange(null);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="group inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-900 dark:hover:text-neutral-100 transition-colors"
    >
      <span>{label}</span>
      <span
        className={`text-[10px] ${
          isActive
            ? "text-slate-700 dark:text-neutral-300"
            : "text-slate-300 opacity-0 group-hover:opacity-100"
        }`}
      >
        {arrow}
      </span>
    </button>
  );
}
