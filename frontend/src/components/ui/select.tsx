import { useEffect, useRef, useState } from "react";

type Option<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
  className?: string;
  // Extra classes appended to the trigger button — e.g. to make it borderless
  // ("ghost"). Appended last so it overrides the default border/bg.
  triggerClassName?: string;
  placeholder?: string;
  // Custom render for each option (used both in the dropdown list and
  // for the currently-selected value in the trigger). Useful for
  // rendering colored chips per option — status / priority pickers
  // pass in their pill component so users can see the color before
  // they pick.
  renderOption?: (option: Option<T>) => React.ReactNode;
  // Optional separate render for the selected value in the trigger, when
  // the dropdown rows are richer than fits on one line (e.g. avatar + name
  // + email stacked). Defaults to renderOption.
  renderValue?: (option: Option<T>) => React.ReactNode;
  // When provided, the dropdown gets a search box on top that filters
  // options by this text (case-insensitive substring) — for long lists
  // such as workspace members. Enter picks the first match.
  getSearchText?: (option: Option<T>) => string;
  searchPlaceholder?: string;
};

/**
 * Light-weight controlled select — replaces the native <select> so we control
 * the dropdown appearance (native select dropdown is OS-themed and looks bad
 * in dark mode). Button → click → menu of options.
 */
export function Select<T extends string>({
  value,
  onChange,
  options,
  className = "",
  triggerClassName = "",
  placeholder,
  renderOption,
  renderValue = renderOption,
  getSearchText,
  searchPlaceholder = "Search…",
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const visible =
    getSearchText && q
      ? options.filter((o) => getSearchText(o).toLowerCase().includes(q))
      : options;

  function pick(v: T) {
    onChange(v);
    setOpen(false);
  }

  function toggle() {
    setQuery("");
    setOpen((v) => !v);
  }

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={toggle}
        className={`w-full flex items-center justify-between rounded border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-1.5 text-sm text-slate-700 dark:text-neutral-300 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 ${triggerClassName}`}
      >
        <span className="truncate">
          {current ? (
            renderValue ? renderValue(current) : current.label
          ) : (
            <span className="text-slate-400 dark:text-neutral-500">{placeholder ?? "Select…"}</span>
          )}
        </span>
        <span className="text-slate-400 dark:text-neutral-500 text-xs ml-2 shrink-0">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 left-0 right-0 overflow-hidden rounded-md border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-lg">
          {getSearchText && (
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (visible[0]) pick(visible[0].value);
                }
              }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              autoFocus
              className="w-full px-3 py-2 text-sm outline-none border-b border-slate-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-slate-900 dark:text-neutral-200 placeholder:text-slate-400"
            />
          )}
          <div className="max-h-60 overflow-auto py-1">
            {visible.length === 0 && (
              <p className="px-3 py-2 text-sm text-slate-400 dark:text-neutral-500">
                No matches
              </p>
            )}
            {visible.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => pick(o.value)}
                className={
                  o.value === value
                    ? "w-full text-left px-3 py-1.5 text-sm bg-slate-50 dark:bg-neutral-800/40 font-medium flex items-center justify-between"
                    : "w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-neutral-800/50 flex items-center justify-between"
                }
              >
                <span className="min-w-0 flex-1">
                  {renderOption ? renderOption(o) : o.label}
                </span>
                {o.value === value && (
                  <span className="text-slate-400 dark:text-neutral-500 text-xs">✓</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
