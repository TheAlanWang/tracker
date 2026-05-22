// Project detail popover — anchored to the project name in ProjectLayout's
// header. Shows the project's free-form description (markdown) plus the
// structured `environments` array (production / staging / repo / etc links).
// Edit mode lets workspace members add / remove / reorder environment rows.
//
// The description-vs-popover split: description still lives in ProjectSettings
// (full markdown editor experience there). The popover treats description as
// read-only — it's the at-a-glance project context surface, not a full editor.

import { AlignLeft, ChevronDown, ChevronUp, Link2, Plus, SquarePen, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  type Project,
  type ProjectEnvironment,
  type ProjectEnvironmentType,
  useUpdateProject,
} from "@/features/projects/api";
import { markdownUrlTransform } from "@/lib/resolveTaskImageUrl";

// Short display labels — DB keeps the full enum ("production" etc.) for
// readability + AI agents, UI shows compact 3-4 char chips so multiple
// environment rows don't burn visual weight. Same labels are used in
// both the read-only pill and the edit-mode dropdown so the user picks
// the value they see.
const TYPE_LABEL: Record<ProjectEnvironmentType, string> = {
  production: "PRD",
  staging: "STG",
  dev: "DEV",
  repo: "REPO",
  docs: "DOCS",
  design: "DSGN",
  other: "OTHR",
};

// One uniform pill style. Color-coding per type added visual noise without
// real wayfinding value — environments are short enough that label alone
// distinguishes them.
const PILL_CLASS =
  "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";

const TYPE_OPTIONS: ProjectEnvironmentType[] = [
  "production",
  "staging",
  "dev",
  "repo",
  "docs",
  "design",
  "other",
];

const POPOVER_WIDTH = 560;
const POPOVER_MAX_H = 560;
const VIEWPORT_MARGIN = 8;

type Props = {
  open: boolean;
  onClose: () => void;
  project: Project;
  anchorRef: React.RefObject<HTMLElement | null>;
};

export function ProjectDetailPopover({
  open,
  onClose,
  project,
  anchorRef,
}: Props) {
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const popoverRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProjectEnvironment[]>(project.environments);
  const [descDraft, setDescDraft] = useState(project.description ?? "");
  const updateProject = useUpdateProject(project.workspace_id);

  // Reset drafts + exit edit mode whenever the popover opens or the project
  // changes underneath (switching projects in the sidebar while popover open).
  useEffect(() => {
    if (open) {
      setDraft(project.environments);
      setDescDraft(project.description ?? "");
      setEditing(false);
    }
  }, [open, project.environments, project.description]);

  // Position the popover anchored to the bottom-left of the trigger, but
  // flip / shift when that would push it off-screen.
  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    let left = r.left;
    if (left + POPOVER_WIDTH + VIEWPORT_MARGIN > window.innerWidth) {
      left = Math.max(VIEWPORT_MARGIN, r.right - POPOVER_WIDTH);
    }
    let top = r.bottom + 8;
    if (top + POPOVER_MAX_H + VIEWPORT_MARGIN > window.innerHeight) {
      top = Math.max(VIEWPORT_MARGIN, r.top - POPOVER_MAX_H - 8);
    }
    setPos({ left, top });
  }, [open, anchorRef]);

  // Outside-click + Esc to close — capture phase on Esc so a lightbox or
  // task-detail-modal Esc handler later in the bubble doesn't co-fire.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey, { capture: true });
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey, { capture: true });
    };
  }, [open, onClose, anchorRef]);

  const dirty = useMemo(() => {
    if (descDraft !== (project.description ?? "")) return true;
    if (draft.length !== project.environments.length) return true;
    return draft.some((d, i) => {
      const orig = project.environments[i];
      return (
        d.name !== orig.name ||
        d.url !== orig.url ||
        d.type !== orig.type
      );
    });
  }, [draft, descDraft, project.environments, project.description]);

  function updateRow(i: number, patch: Partial<ProjectEnvironment>) {
    setDraft((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setDraft((rows) => [
      ...rows,
      { name: "", url: "", type: "production" },
    ]);
  }

  function removeRow(i: number) {
    setDraft((rows) => rows.filter((_, idx) => idx !== i));
  }

  function moveRow(i: number, dir: -1 | 1) {
    setDraft((rows) => {
      const target = i + dir;
      if (target < 0 || target >= rows.length) return rows;
      const next = [...rows];
      [next[i], next[target]] = [next[target], next[i]];
      return next;
    });
  }

  async function save() {
    // Strip rows with empty name or url — saves the user from forgetting
    // to fill in a "+ Add environment" they clicked but didn't complete.
    const cleaned = draft
      .map((r) => ({
        name: r.name.trim(),
        url: r.url.trim(),
        type: r.type,
      }))
      // URL is the row's identity — name is an optional label. A row
      // with URL but no name still keeps the link; an entirely-empty
      // row (forgot to fill in after "+ Add environment") drops.
      .filter((r) => r.url);

    // Trim description; empty string means "clear" — backend converts to NULL.
    const trimmedDesc = descDraft.trim();
    try {
      await updateProject.mutateAsync({
        projectId: project.id,
        payload: {
          description: trimmedDesc === "" ? null : trimmedDesc,
          environments: cleaned,
        },
      });
      setEditing(false);
      toast.success("Saved");
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Failed to save";
      toast.error(detail);
    }
  }

  function cancel() {
    setDraft(project.environments);
    setDescDraft(project.description ?? "");
    setEditing(false);
  }

  if (!open) return null;

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
        width: POPOVER_WIDTH,
        maxHeight: POPOVER_MAX_H,
      }}
      className="z-50 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-y-auto"
    >
      <div className="px-5 pt-5 pb-5 space-y-3">
        {/* Description */}
        <section className="space-y-1">
          {/* [Edit] [Close] live on the same baseline as the section
              label — tight section toolbar. -my-1 keeps the icon
              buttons from pushing the header row taller than the
              label itself. */}
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-400">
              <AlignLeft className="w-3.5 h-3.5" aria-hidden />
              <span>Description</span>
            </h3>
            <div className="flex items-center gap-1 -my-1">
              {!editing && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  title="Edit"
                  aria-label="Edit project details"
                  className="text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 p-1 rounded transition-colors"
                >
                  <SquarePen className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                title="Close"
                aria-label="Close"
                className="text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 p-1 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          {editing ? (
            <textarea
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              placeholder="What is this project? (markdown supported)"
              rows={3}
              className="w-full rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 text-sm resize-y"
            />
          ) : project.description?.trim() ? (
            <div className="prose prose-sm max-w-none text-slate-700 dark:text-slate-300 prose-pre:bg-slate-100 dark:prose-pre:bg-slate-800/60">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                urlTransform={markdownUrlTransform}
              >
                {project.description}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm italic text-slate-400 dark:text-slate-500">
              No description yet.
            </p>
          )}
        </section>

        <div className="h-px bg-slate-100 dark:bg-slate-800" />

        {/* Environments */}
        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-400">
            <Link2 className="w-3.5 h-3.5" aria-hidden />
            <span>Environments</span>
          </h3>

          {!editing ? (
            // View mode
            draft.length === 0 ? (
              <p className="text-sm italic text-slate-400 dark:text-slate-500">
                No environments yet.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {draft.map((env, i) => (
                  <li
                    key={`${env.name}-${i}`}
                    className="flex items-center gap-3 min-w-0"
                  >
                    <span
                      className={`shrink-0 inline-flex items-center justify-center w-14 rounded-full text-[10px] font-medium uppercase tracking-wider py-1 ${PILL_CLASS}`}
                    >
                      {TYPE_LABEL[env.type]}
                    </span>
                    <span className="shrink-0 text-sm font-medium text-slate-900 dark:text-slate-100 min-w-[3rem]">
                      {env.name}
                    </span>
                    <a
                      href={env.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={env.url}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline truncate min-w-0 flex-1"
                    >
                      {env.url}
                    </a>
                  </li>
                ))}
              </ul>
            )
          ) : (
            // Edit mode — borderless rows: type pill on the left, three
            // stacked borderless inputs (name / url / notes) in the middle,
            // trash button that only shows on row hover. Pattern inspired
            // by ChecklistSection (bg-transparent inputs) +
            // DependenciesSection (group-hover reveal).
            <div>
              <div>
                {draft.map((env, i) => (
                  <div
                    key={i}
                    className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-b-0"
                  >
                    <select
                      value={env.type}
                      onChange={(e) =>
                        updateRow(i, {
                          type: e.target.value as ProjectEnvironmentType,
                        })
                      }
                      className={`mt-0.5 shrink-0 appearance-none cursor-pointer w-14 text-center text-[10px] font-medium uppercase tracking-wider rounded-full px-1 py-1 ${PILL_CLASS} hover:ring-1 hover:ring-slate-300 dark:hover:ring-slate-600 transition`}
                    >
                      {TYPE_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {TYPE_LABEL[t]}
                        </option>
                      ))}
                    </select>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <input
                        placeholder="Name (e.g. Production)"
                        value={env.name}
                        onChange={(e) => updateRow(i, { name: e.target.value })}
                        className="bg-transparent outline-none text-sm font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 placeholder:font-normal"
                      />
                      <input
                        placeholder="https://..."
                        value={env.url}
                        onChange={(e) => updateRow(i, { url: e.target.value })}
                        className="bg-transparent outline-none text-xs text-blue-600 dark:text-blue-400 placeholder:text-slate-400"
                      />
                    </div>
                    {/* Row actions — [↑] [↓] [🗑] horizontal cluster,
                        hidden until row hover. First row's ↑ and last
                        row's ↓ are disabled (visually dimmed) so the
                        cluster always renders the same shape and the
                        buttons don't shift around as you reorder. */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 flex items-center gap-0.5 mt-1">
                      <button
                        type="button"
                        onClick={() => moveRow(i, -1)}
                        disabled={i === 0}
                        title="Move up"
                        aria-label="Move up"
                        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-400 dark:disabled:hover:text-slate-500"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveRow(i, 1)}
                        disabled={i === draft.length - 1}
                        title="Move down"
                        aria-label="Move down"
                        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-400 dark:disabled:hover:text-slate-500"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        title="Remove"
                        aria-label="Remove environment"
                        className="text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addRow}
                className="mt-3 w-full inline-flex items-center justify-center gap-1 rounded border border-dashed border-slate-300 dark:border-slate-700 px-2 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:border-slate-400"
              >
                <Plus className="w-3 h-3" />
                Add environment
              </button>
              <div className="flex items-center justify-end gap-2 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={cancel}
                  disabled={updateProject.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={save}
                  disabled={!dirty || updateProject.isPending}
                >
                  {updateProject.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>,
    document.body,
  );
}
