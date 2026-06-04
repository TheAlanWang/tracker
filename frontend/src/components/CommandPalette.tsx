import { useMemo, useState, type ReactNode } from "react";
import { Command } from "cmdk";
import { useNavigate, useParams } from "react-router-dom";

import { useSearch, type SearchResult } from "@/features/search/api";
import { isLabelsEnabled, useWorkspaces } from "@/features/workspaces/api";
import { useCommandPaletteStore } from "@/lib/commandPaletteStore";
import { buildNavTargets, matchNavTarget } from "@/lib/navTargets";
import { addRecent, getRecents, type RecentItem } from "@/lib/recents";

const TYPE_LABEL: Record<SearchResult["type"], string> = {
  project: "Projects",
  task: "Tasks",
  goal: "Goals",
  sprint: "Sprints",
  label: "Labels",
};

// Display order for the grouped result sections.
const TYPE_ORDER: SearchResult["type"][] = [
  "project",
  "task",
  "goal",
  "sprint",
  "label",
];

// Shared styling for each result group. The uppercase grey heading plus a
// hairline divider + top spacing on every group after the first keeps the
// sections (Tasks / Go to / …) visually distinct without shouting.
const GROUP_CLASS =
  "[&:not(:first-child)]:mt-2 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-slate-200 dark:[&:not(:first-child)]:border-neutral-700 [&:not(:first-child)]:pt-2 " +
  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-slate-600 dark:[&_[cmdk-group-heading]]:text-neutral-300 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Highlight the matched query substring within text. Fuzzy results may not
// contain the literal query — in that case the text renders unchanged.
function highlight(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, "ig"));
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark
        key={i}
        className="bg-amber-100 text-inherit dark:bg-amber-400/25 rounded-[2px]"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export function CommandPalette() {
  const { open, close } = useCommandPaletteStore();
  const { wsSlug = "" } = useParams<{ wsSlug: string }>();
  const navigate = useNavigate();

  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const workspaceId = currentWs?.id ?? "";

  const [query, setQuery] = useState("");

  const { data: searchResults = [] } = useSearch(query, workspaceId, wsSlug);
  const recents = getRecents();

  // Static "Go to" navigation targets (pages + settings sections), filtered
  // client-side by the same query. Independent of the server entity search.
  const navTargets = useMemo(() => buildNavTargets(wsSlug), [wsSlug]);
  const navMatches =
    query.trim() === ""
      ? []
      : navTargets.filter((t) => matchNavTarget(t, query));

  function handleSelect(href: string, label: string, sublabel?: string) {
    addRecent({ href, label, sublabel });
    navigate(href);
    close();
    setQuery("");
  }

  function handleOpenChange(value: boolean) {
    if (!value) {
      close();
      setQuery("");
    }
  }

  // Drop label results when the Labels feature is disabled for this workspace.
  const labelsEnabled = isLabelsEnabled(currentWs);
  const visibleResults = labelsEnabled
    ? searchResults
    : searchResults.filter((r) => r.type !== "label");

  // Group search results by type (label results already dropped above when
  // the Labels feature is off).
  const byType = visibleResults.reduce<Record<string, SearchResult[]>>(
    (acc, r) => {
      if (!acc[r.type]) acc[r.type] = [];
      acc[r.type].push(r);
      return acc;
    },
    {},
  );

  return (
    <Command.Dialog
      open={open}
      onOpenChange={handleOpenChange}
      label="Command palette"
      shouldFilter={false}
      overlayClassName=""
      contentClassName=""
    >
      {/* Custom overlay and centering wrapper. Tapping the backdrop closes the
          palette — the only dismiss path on touch, where there's no Esc key. */}
      <div
        className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[15vh] sm:pt-[20vh] bg-black/30"
        onClick={() => handleOpenChange(false)}
      >
        <div
          className="w-full max-w-xl rounded-lg bg-white dark:bg-neutral-900 shadow-xl border border-slate-200 dark:border-neutral-800 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Search projects, tasks, goals…"
            className="w-full px-4 py-3 text-sm outline-none border-b border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 placeholder:text-slate-400"
          />
          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-slate-500 dark:text-neutral-400">
              No results.
            </Command.Empty>

            {/* Recents (shown when query is empty) */}
            {query.trim() === "" && recents.length > 0 && (
              <Command.Group
                heading="Recent"
                className={GROUP_CLASS}
              >
                {recents.map((item: RecentItem) => (
                  <CommandItem
                    key={item.href}
                    value={item.href}
                    label={item.label}
                    sublabel={item.sublabel}
                    onSelect={() =>
                      handleSelect(item.href, item.label, item.sublabel)
                    }
                  />
                ))}
              </Command.Group>
            )}

            {/* Search results grouped by type */}
            {query.trim() !== "" &&
              TYPE_ORDER.map((type) => {
                const items = byType[type];
                if (!items || items.length === 0) return null;
                return (
                  <Command.Group
                    key={type}
                    heading={TYPE_LABEL[type]}
                    className={GROUP_CLASS}
                  >
                    {items.map((r) => (
                      <CommandItem
                        key={r.id}
                        value={r.id}
                        label={r.label}
                        sublabel={r.sublabel ?? undefined}
                        query={query}
                        onSelect={() =>
                          handleSelect(r.href, r.label, r.sublabel ?? undefined)
                        }
                      />
                    ))}
                  </Command.Group>
                );
              })}

            {/* Navigation: jump to a page or settings section */}
            {navMatches.length > 0 && (
              <Command.Group
                heading="Go to"
                className={GROUP_CLASS}
              >
                {navMatches.map((t) => (
                  <CommandItem
                    key={t.id}
                    value={t.id}
                    label={t.label}
                    sublabel={t.context}
                    onSelect={() => handleSelect(t.href, t.label, t.context)}
                  />
                ))}
              </Command.Group>
            )}
          </Command.List>
        </div>
      </div>
    </Command.Dialog>
  );
}

function CommandItem({
  value,
  label,
  sublabel,
  query,
  onSelect,
}: {
  // Unique cmdk value for keyboard selection; falls back to label.
  value?: string;
  label: string;
  sublabel?: string;
  query?: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={value ?? label}
      onSelect={onSelect}
      className="flex items-center justify-between rounded px-3 py-2 text-sm cursor-pointer text-slate-900 dark:text-neutral-200 data-[selected=true]:bg-slate-100 aria-selected:bg-slate-100"
    >
      <span className="truncate">{query ? highlight(label, query) : label}</span>
      {sublabel && (
        <span className="ml-3 shrink-0 text-xs text-slate-400 dark:text-neutral-500">
          {query ? highlight(sublabel, query) : sublabel}
        </span>
      )}
    </Command.Item>
  );
}
