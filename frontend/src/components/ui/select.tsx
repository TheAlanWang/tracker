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
  placeholder?: string;
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
  placeholder,
}: Props<T>) {
  const [open, setOpen] = useState(false);
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

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
      >
        <span className="truncate">
          {current?.label ?? (
            <span className="text-slate-400">{placeholder ?? "Select…"}</span>
          )}
        </span>
        <span className="text-slate-400 text-xs ml-2 shrink-0">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 left-0 right-0 max-h-60 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg py-1">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={
                o.value === value
                  ? "w-full text-left px-3 py-1.5 text-sm bg-slate-50 font-medium flex items-center justify-between"
                  : "w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 flex items-center justify-between"
              }
            >
              <span>{o.label}</span>
              {o.value === value && (
                <span className="text-slate-400 text-xs">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
