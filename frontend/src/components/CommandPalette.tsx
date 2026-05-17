import { useState } from "react";
import { Command } from "cmdk";
import { useNavigate, useParams } from "react-router-dom";

import { useSearch, type SearchResult } from "@/features/search/api";
import { useWorkspaces } from "@/features/workspaces/api";
import { useCommandPaletteStore } from "@/lib/commandPaletteStore";
import { addRecent, getRecents, type RecentItem } from "@/lib/recents";

const TYPE_LABEL: Record<SearchResult["type"], string> = {
  project: "Projects",
  task: "Tasks",
  label: "Labels",
};

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

  // Group search results by type
  const byType = searchResults.reduce<
    Record<string, SearchResult[]>
  >((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {});

  return (
    <Command.Dialog
      open={open}
      onOpenChange={handleOpenChange}
      label="Command palette"
      shouldFilter={false}
      overlayClassName=""
      contentClassName=""
    >
      {/* Custom overlay and centering wrapper */}
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/30">
        <div className="w-full max-w-xl rounded-lg bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Search projects, tasks, labels…"
            className="w-full px-4 py-3 text-sm outline-none border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 placeholder:text-slate-400"
          />
          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              No results.
            </Command.Empty>

            {/* Recents (shown when query is empty) */}
            {query.trim() === "" && recents.length > 0 && (
              <Command.Group
                heading="Recent"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-slate-500 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide"
              >
                {recents.map((item: RecentItem) => (
                  <CommandItem
                    key={item.href}
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
              (["project", "task", "label"] as const).map((type) => {
                const items = byType[type];
                if (!items || items.length === 0) return null;
                return (
                  <Command.Group
                    key={type}
                    heading={TYPE_LABEL[type]}
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-slate-500 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide"
                  >
                    {items.map((r) => (
                      <CommandItem
                        key={r.id}
                        label={r.label}
                        sublabel={r.sublabel ?? undefined}
                        onSelect={() =>
                          handleSelect(r.href, r.label, r.sublabel ?? undefined)
                        }
                      />
                    ))}
                  </Command.Group>
                );
              })}
          </Command.List>
        </div>
      </div>
    </Command.Dialog>
  );
}

function CommandItem({
  label,
  sublabel,
  onSelect,
}: {
  label: string;
  sublabel?: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={label}
      onSelect={onSelect}
      className="flex items-center justify-between rounded px-3 py-2 text-sm cursor-pointer text-slate-900 dark:text-slate-100 data-[selected=true]:bg-slate-100 aria-selected:bg-slate-100"
    >
      <span className="truncate">{label}</span>
      {sublabel && (
        <span className="ml-3 shrink-0 text-xs text-slate-400 dark:text-slate-500">{sublabel}</span>
      )}
    </Command.Item>
  );
}
