// Theme management — System / Light / Dark.
//
// Source of truth is the user's `localStorage["tracker-theme"]`, which can
// be one of "light" | "dark" | "system". "system" follows
// `prefers-color-scheme`. The hook keeps `<html>`'s `dark` class in sync
// so Tailwind's `dark:` variants light up across the app.
//
// To avoid a flash-of-light on first paint, index.html runs a tiny
// inline script *before* React mounts to apply the stored preference
// immediately. This hook is purely the runtime API for changing it.

import { useEffect, useState } from "react";

export type Theme = "system" | "light" | "dark";

const STORAGE_KEY = "tracker-theme";

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const isDark = theme === "dark" || (theme === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", isDark);
}

export function useTheme(): {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolved: "light" | "dark";
} {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());
  const [resolved, setResolved] = useState<"light" | "dark">(() =>
    theme === "dark" || (theme === "system" && systemPrefersDark())
      ? "dark"
      : "light",
  );

  // Apply on mount + whenever theme changes.
  useEffect(() => {
    applyTheme(theme);
    setResolved(
      theme === "dark" || (theme === "system" && systemPrefersDark())
        ? "dark"
        : "light",
    );
  }, [theme]);

  // When in "system" mode, react to OS theme flips.
  useEffect(() => {
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      applyTheme("system");
      setResolved(systemPrefersDark() ? "dark" : "light");
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [theme]);

  function setTheme(next: Theme) {
    window.localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  }

  return { theme, setTheme, resolved };
}
