import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  DUE_PRESETS,
  DUE_PRESET_LABELS,
  FILTER_FIELD_LABELS,
  defaultFilterFor,
  type DuePreset,
  type Filter,
  type FilterField,
} from "@/features/tasks/filters";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
} from "@/features/tasks/labels";
import type { TaskPriority, TaskStatus } from "@/features/tasks/api";

const STATUS_OPTIONS: TaskStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "cancelled",
];

const PRIORITY_OPTIONS: TaskPriority[] = [
  "urgent",
  "high",
  "medium",
  "low",
  "no_priority",
];

// ---- Portal popover helpers ----

function usePortalAnchor(
  open: boolean,
  triggerRef: React.RefObject<HTMLElement | null>,
) {
  const [pos, setPos] = useState({ left: 0, top: 0 });
  useEffect(() => {
    if (!open) return;
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 4 });
  }, [open, triggerRef]);
  return pos;
}

function useDismiss(
  open: boolean,
  onClose: () => void,
  refs: React.RefObject<HTMLElement | null>[],
) {
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (refs.some((r) => r.current?.contains(target))) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, refs]);
}

// Caller supplies the project list so FilterBar stays decoupled from any
// specific data hook. Keyed by project id.
export type ProjectOption = { id: string; name: string };

function summarizeFilter(
  f: Filter,
  projectOptions: ProjectOption[] = [],
): string {
  if (f.field === "status") {
    if (f.values.length === 0) return "Status: any";
    if (f.values.length === 1) return `Status: ${STATUS_LABELS[f.values[0]]}`;
    return `Status: ${f.values.length} selected`;
  }
  if (f.field === "priority") {
    if (f.values.length === 0) return "Priority: any";
    if (f.values.length === 1)
      return `Priority: ${PRIORITY_LABELS[f.values[0]]}`;
    return `Priority: ${f.values.length} selected`;
  }
  if (f.field === "project") {
    if (f.values.length === 0) return "Project: any";
    if (f.values.length === 1) {
      const p = projectOptions.find((o) => o.id === f.values[0]);
      return `Project: ${p?.name ?? "—"}`;
    }
    return `Project: ${f.values.length} selected`;
  }
  return `Due: ${DUE_PRESET_LABELS[f.preset]}`;
}

function FilterChip({
  filter,
  onChange,
  onRemove,
  projectOptions = [],
}: {
  filter: Filter;
  onChange: (next: Filter) => void;
  onRemove: () => void;
  projectOptions?: ProjectOption[];
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const pos = usePortalAnchor(open, triggerRef);
  useDismiss(open, () => setOpen(false), [triggerRef, popoverRef]);

  return (
    <>
      <div className="inline-flex items-center rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="px-2.5 py-1 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
        >
          {summarizeFilter(filter, projectOptions)}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="px-2 py-1 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          aria-label="Remove filter"
        >
          ×
        </button>
      </div>
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ position: "fixed", left: pos.left, top: pos.top }}
            className="z-50 w-56 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl py-1 max-h-80 overflow-y-auto"
          >
            {filter.field === "status" && (
              <CheckboxList
                options={STATUS_OPTIONS}
                labelFor={(s) => STATUS_LABELS[s]}
                selected={filter.values}
                onChange={(next) =>
                  onChange({ field: "status", values: next as TaskStatus[] })
                }
              />
            )}
            {filter.field === "priority" && (
              <CheckboxList
                options={PRIORITY_OPTIONS}
                labelFor={(p) => PRIORITY_LABELS[p]}
                selected={filter.values}
                onChange={(next) =>
                  onChange({
                    field: "priority",
                    values: next as TaskPriority[],
                  })
                }
              />
            )}
            {filter.field === "due" && (
              <RadioList
                options={DUE_PRESETS}
                labelFor={(p) => DUE_PRESET_LABELS[p]}
                selected={filter.preset}
                onChange={(next) => {
                  onChange({ field: "due", preset: next as DuePreset });
                  setOpen(false);
                }}
              />
            )}
            {filter.field === "project" && (
              <>
                {projectOptions.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">
                    No projects in this workspace.
                  </p>
                ) : (
                  <CheckboxList
                    options={projectOptions.map((p) => p.id)}
                    labelFor={(id) =>
                      projectOptions.find((p) => p.id === id)?.name ?? id
                    }
                    selected={filter.values}
                    onChange={(next) =>
                      onChange({ field: "project", values: next })
                    }
                  />
                )}
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

function CheckboxList<T extends string>({
  options,
  labelFor,
  selected,
  onChange,
}: {
  options: T[];
  labelFor: (v: T) => string;
  selected: T[];
  onChange: (next: T[]) => void;
}) {
  const toggle = (v: T) => {
    onChange(
      selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v],
    );
  };
  return (
    <>
      {options.map((opt) => (
        <label
          key={opt}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer select-none"
        >
          <input
            type="checkbox"
            checked={selected.includes(opt)}
            onChange={() => toggle(opt)}
            className="rounded border-slate-300 dark:border-slate-700"
          />
          <span>{labelFor(opt)}</span>
        </label>
      ))}
    </>
  );
}

function RadioList<T extends string>({
  options,
  labelFor,
  selected,
  onChange,
}: {
  options: T[];
  labelFor: (v: T) => string;
  selected: T;
  onChange: (next: T) => void;
}) {
  return (
    <>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`w-full text-left flex items-center justify-between px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
            selected === opt ? "bg-slate-50 dark:bg-slate-800/40 text-slate-900 dark:text-slate-100" : "text-slate-700 dark:text-slate-300"
          }`}
        >
          <span>{labelFor(opt)}</span>
          {selected === opt && (
            <span className="text-blue-600 text-xs">✓</span>
          )}
        </button>
      ))}
    </>
  );
}

function AddFilterButton({
  availableFields,
  onAdd,
}: {
  availableFields: FilterField[];
  onAdd: (field: FilterField) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pos = usePortalAnchor(open, triggerRef);
  useDismiss(open, () => setOpen(false), [triggerRef, menuRef]);

  if (availableFields.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:border-slate-400"
      >
        <span>+ Filter</span>
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", left: pos.left, top: pos.top }}
            className="z-50 w-40 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl py-1"
          >
            {availableFields.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  onAdd(f);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                {FILTER_FIELD_LABELS[f]}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

type Props = {
  filters: Filter[];
  onFiltersChange: (next: Filter[]) => void;
  // Which filter fields to expose. Defaults to status / priority / due (the
  // task-intrinsic ones). Pages that want Project filtering pass it in here.
  availableFilterFields?: FilterField[];
  // Required when "project" is in availableFilterFields. Used both to render
  // the editor checkbox list and to look up names in the chip summary.
  projectOptions?: ProjectOption[];
  // Optional right-side slot (e.g., the Columns visibility menu).
  trailing?: React.ReactNode;
};

const ALL_FILTER_FIELDS: FilterField[] = ["status", "priority", "due"];

export function FilterBar({
  filters,
  onFiltersChange,
  availableFilterFields = ALL_FILTER_FIELDS,
  projectOptions,
  trailing,
}: Props) {
  const usedFields = new Set(filters.map((f) => f.field));
  const addable = availableFilterFields.filter((f) => !usedFields.has(f));

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {filters.map((f, idx) => (
        <FilterChip
          key={`${f.field}-${idx}`}
          filter={f}
          projectOptions={projectOptions}
          onChange={(next) =>
            onFiltersChange(filters.map((cur, i) => (i === idx ? next : cur)))
          }
          onRemove={() =>
            onFiltersChange(filters.filter((_, i) => i !== idx))
          }
        />
      ))}
      <AddFilterButton
        availableFields={addable}
        onAdd={(field) =>
          onFiltersChange([...filters, defaultFilterFor(field)])
        }
      />
      {trailing && <div className="ml-auto">{trailing}</div>}
    </div>
  );
}
