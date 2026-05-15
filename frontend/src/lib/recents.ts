const RECENTS_KEY = "tracker.commandPaletteRecents";
const MAX_RECENTS = 10;

export type RecentItem = {
  href: string;
  label: string;
  sublabel?: string;
};

export function getRecents(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentItem[];
  } catch {
    return [];
  }
}

export function addRecent(item: RecentItem): void {
  try {
    const existing = getRecents().filter((r) => r.href !== item.href);
    const updated = [item, ...existing].slice(0, MAX_RECENTS);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(updated));
  } catch {
    // ignore storage errors
  }
}
