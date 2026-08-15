import { useEffect, useState } from "react";

// Persists a set of hidden column keys to localStorage under `key`.
// Callers build their own namespaced key (each page uses a different
// prefix/scope) and pass their own default-hidden set — this hook only
// owns the read/write-on-change mechanics, which were previously
// re-implemented per page.
export function useHiddenColumns<T extends string>(
  key: string,
  defaultHidden: readonly T[] = [],
) {
  const [hidden, setHidden] = useState<Set<T>>(() => {
    if (!key) return new Set(defaultHidden);
    try {
      const raw = localStorage.getItem(key);
      return raw ? new Set(JSON.parse(raw) as T[]) : new Set(defaultHidden);
    } catch {
      return new Set(defaultHidden);
    }
  });

  useEffect(() => {
    if (!key) return;
    localStorage.setItem(key, JSON.stringify([...hidden]));
  }, [key, hidden]);

  return [hidden, setHidden] as const;
}
