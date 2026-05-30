// SettingsSidebar — the left rail shown on /settings, /profile, and
// /p/:pKey/settings. Mirrors WorkspaceLayout's SidebarNav structure
// (same border, background, padding, width, item tokens) so the two
// rails are visually interchangeable. WorkspaceLayout swaps between
// them based on whether the route is a settings route.

import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { CreditCard, Folder, LayoutGrid, User } from "lucide-react";

import { useProjects } from "@/features/projects/api";
import { useWorkspaces } from "@/features/workspaces/api";
import { projectDotColor } from "@/lib/projectColor";
import { useTheme } from "@/hooks/useTheme";

export function SettingsSidebar({
  collapsed: collapsedPinned,
  onToggle,
}: {
  // Shared with WorkspaceLayout's SidebarNav so collapse state survives
  // navigation between settings and the rest of the app.
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { wsSlug, pKey } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const { data: workspaces = [] } = useWorkspaces();
  const currentWs = workspaces.find((w) => w.slug === wsSlug);
  const { data: projects = [] } = useProjects(currentWs?.id ?? "");
  const { resolved: theme } = useTheme();
  const isDark = theme === "dark";

  // Three mutually-exclusive "what's selected" states. Profile is user-
  // scoped (above the workspaces tree), so it suppresses the workspace-row
  // highlight even though the URL still contains wsSlug for context.
  const onProfileSettings = location.pathname.endsWith("/profile");
  const onBillingPage = location.pathname.endsWith("/billing");
  const onProjectSettings = !!pKey;

  // Style tokens lifted from WorkspaceLayout's SidebarNav so the rails
  // are visually interchangeable. `pl-7` indents items so their text
  // (or leading dot) aligns with the section label's text — section
  // labels' icons sit one tier outdented, creating clear hierarchy.
  const itemBase =
    "group flex items-center gap-2.5 w-full text-left rounded-md pl-7 pr-2 py-1.5 text-sm font-normal tracking-tight transition-colors";
  const itemIdle = `${itemBase} text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-100 hover:bg-slate-100 dark:hover:bg-neutral-800`;
  const itemActive = `${itemBase} text-slate-900 dark:text-neutral-200 bg-slate-100 dark:bg-neutral-800 font-medium`;
  // Parent-active = "you're on a project that belongs to this workspace".
  // Lighter bg (slate-50) than directActive (slate-100) so it reads as a
  // weaker tier — context, not focus. Profile is user-scoped (not a
  // workspace child), so it deliberately does NOT trigger parent-active.
  const itemParentActive = `${itemBase} text-slate-900 dark:text-neutral-200 bg-slate-50 dark:bg-neutral-800/40 hover:bg-slate-100 dark:hover:bg-neutral-800`;
  // First section (Account) sits right under the "Settings" title — use
  // the smaller `firstSectionLabel` so the gap isn't oversized. Subsequent
  // sections use the larger `pt-5` to separate from the previous block.
  const sectionLabel =
    "flex items-center gap-1.5 px-2 pt-5 pb-1.5 text-[10px] uppercase tracking-[0.12em] text-slate-400 dark:text-neutral-500 font-semibold";
  const firstSectionLabel =
    "flex items-center gap-1.5 px-2 pt-2 pb-1.5 text-[10px] uppercase tracking-[0.12em] text-slate-400 dark:text-neutral-500 font-semibold";

  // Hover-to-peek — same behavior as SidebarNav: when pinned-collapsed,
  // hovering the 48px rail floats the full rail over the content as an
  // overlay (no <main> shift). `collapsed` below = pinned-collapsed AND not
  // peeking, so all the rail/full content checks stay keyed on one flag.
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef<number | null>(null);
  const openPeek = () => {
    if (peekTimer.current) window.clearTimeout(peekTimer.current);
    peekTimer.current = window.setTimeout(() => setPeek(true), 120);
  };
  const closePeek = () => {
    if (peekTimer.current) {
      window.clearTimeout(peekTimer.current);
      peekTimer.current = null;
    }
    setPeek(false);
  };
  useEffect(
    () => () => {
      if (peekTimer.current) window.clearTimeout(peekTimer.current);
    },
    [],
  );
  const collapsed = collapsedPinned && !peek;
  const handleToggle = () => {
    closePeek();
    onToggle();
  };

  return (
    <>
      {/* Reserve the 48px gutter in flow when pinned-collapsed so <main>
          doesn't shift; the <aside> floats over it and widens on hover. */}
      {collapsedPinned && <div className="w-12 shrink-0" aria-hidden />}
      <aside
        onMouseEnter={collapsedPinned ? openPeek : undefined}
        onMouseLeave={collapsedPinned ? closePeek : undefined}
        className={`group/sidebar border-r border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-2 flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden transition-[width] duration-200 ease-out ${
          collapsedPinned
            ? `absolute left-0 inset-y-0 z-30 ${peek ? "w-56 shadow-xl" : "w-12"}`
            : "relative w-56 shrink-0"
        }`}
      >
      {/* Collapse toggle — same two-mode pattern as SidebarNav. Collapsed:
          always-visible expand button (only way back). Expanded: absolute
          top-right + hover-revealed (Linear / Notion pattern). */}
      {collapsed ? (
        <button
          type="button"
          onClick={handleToggle}
          className="self-center w-7 h-7 flex items-center justify-center rounded text-slate-400 dark:text-neutral-500 hover:text-slate-900 dark:hover:text-neutral-100 hover:bg-slate-100 dark:hover:bg-neutral-800 mb-1 shrink-0"
          title="Expand sidebar"
          aria-label="Expand sidebar"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
          >
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <line x1="9" y1="4" x2="9" y2="20" />
            <path d="M13 9l3 3-3 3" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleToggle}
          className="absolute top-2 right-2 z-10 w-7 h-7 flex items-center justify-center rounded text-slate-400 dark:text-neutral-500 hover:text-slate-900 dark:hover:text-neutral-100 hover:bg-slate-100 dark:hover:bg-neutral-800 transition-opacity opacity-0 group-hover/sidebar:opacity-100 focus:opacity-100"
          title={collapsedPinned ? "Pin sidebar open" : "Collapse sidebar"}
          aria-label={collapsedPinned ? "Pin sidebar open" : "Collapse sidebar"}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
          >
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <line x1="9" y1="4" x2="9" y2="20" />
            <path d={collapsedPinned ? "M13 9l3 3-3 3" : "M16 9l-3 3 3 3"} />
          </svg>
        </button>
      )}

      {collapsed ? (
        // Collapsed rail — three tiers stacked: Profile (User icon),
        // workspaces (first-letter badges, à la Slack/Notion switcher),
        // projects (colored dots). Each tier separated with `mt-3` so
        // the grouping reads at a glance without explicit labels.
        <>
          <button
            type="button"
            onClick={() => navigate(`/w/${wsSlug}/profile`)}
            className={`group flex items-center justify-center w-full rounded-md py-1.5 transition-colors ${
              onProfileSettings
                ? "bg-slate-100 dark:bg-neutral-800 text-slate-900 dark:text-neutral-200"
                : "text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-100 hover:bg-slate-100 dark:hover:bg-neutral-800"
            }`}
            title="Profile"
            aria-label="Profile"
          >
            <User className="w-4 h-4" strokeWidth={1.7} />
          </button>
          <button
            type="button"
            onClick={() => navigate(`/w/${wsSlug}/billing`)}
            className={`group flex items-center justify-center w-full rounded-md py-1.5 transition-colors ${
              onBillingPage
                ? "bg-slate-100 dark:bg-neutral-800 text-slate-900 dark:text-neutral-200"
                : "text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-100 hover:bg-slate-100 dark:hover:bg-neutral-800"
            }`}
            title="Billing"
            aria-label="Billing"
          >
            <CreditCard className="w-4 h-4" strokeWidth={1.7} />
          </button>

          {workspaces.length > 0 && (
            <div className="mt-3 space-y-0.5">
              {workspaces.map((w) => {
                const directActive =
                  w.slug === wsSlug &&
                  !onProjectSettings &&
                  !onProfileSettings;
                const parentActive =
                  w.slug === wsSlug && onProjectSettings;
                const initial = w.name.charAt(0).toUpperCase() || "?";
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => navigate(`/w/${w.slug}/settings`)}
                    className={`group flex items-center justify-center w-full rounded-md py-1 transition-colors ${
                      directActive
                        ? "bg-slate-100 dark:bg-neutral-800"
                        : parentActive
                          ? "bg-slate-50 dark:bg-neutral-800/40"
                          : "hover:bg-slate-100 dark:hover:bg-neutral-800"
                    }`}
                    title={w.name}
                    aria-label={w.name}
                  >
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300">
                      {initial}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {currentWs && projects.length > 0 && (
            <div className="mt-3 space-y-0.5">
              {projects.map((p) => {
                const active = p.key === pKey;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      navigate(`/w/${wsSlug}/p/${p.key}/settings`)
                    }
                    className={`group flex items-center justify-center w-full rounded-md py-1.5 transition-colors ${
                      active
                        ? "bg-slate-100 dark:bg-neutral-800"
                        : "hover:bg-slate-100 dark:hover:bg-neutral-800"
                    }`}
                    title={p.name}
                    aria-label={p.name}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{
                        backgroundColor: projectDotColor({
                          key: p.key,
                          color: p.color,
                          dark: isDark,
                        }),
                      }}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <h2 className="px-2 pt-1 pb-0 text-[15px] font-semibold tracking-tight text-slate-900 dark:text-neutral-200">
            Settings
          </h2>
          <p className={firstSectionLabel}>
            <User className="w-3.5 h-3.5" strokeWidth={1.7} />
            Account
          </p>
          <button
            type="button"
            onClick={() => navigate(`/w/${wsSlug}/profile`)}
            className={onProfileSettings ? itemActive : itemIdle}
          >
            Profile
          </button>
          <button
            type="button"
            onClick={() => navigate(`/w/${wsSlug}/billing`)}
            className={onBillingPage ? itemActive : itemIdle}
          >
            Billing
          </button>

          <p className={sectionLabel}>
            <LayoutGrid className="w-3.5 h-3.5" strokeWidth={1.7} />
            Workspaces
          </p>
          {workspaces.map((w) => {
            const directActive =
              w.slug === wsSlug && !onProjectSettings && !onProfileSettings;
            const parentActive = w.slug === wsSlug && onProjectSettings;
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => navigate(`/w/${w.slug}/settings`)}
                className={
                  directActive
                    ? itemActive
                    : parentActive
                      ? itemParentActive
                      : itemIdle
                }
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="truncate">{w.name}</span>
                  {w.plan === "pro" && (
                    <span
                      className="shrink-0 text-sm leading-none text-[#C9A227] dark:text-[#E8C766]"
                      title="Pro"
                      aria-label="Pro plan"
                    >
                      ✦
                    </span>
                  )}
                </span>
              </button>
            );
          })}

          {currentWs && (
            <>
              <p className={sectionLabel}>
                <Folder className="w-3.5 h-3.5" strokeWidth={1.7} />
                Projects in {currentWs.name}
              </p>
              {projects.length === 0 ? (
                <p className="px-2 text-xs text-slate-400 dark:text-neutral-500 italic">
                  No projects yet
                </p>
              ) : (
                projects.map((p) => {
                  const active = p.key === pKey;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        navigate(`/w/${wsSlug}/p/${p.key}/settings`)
                      }
                      className={active ? itemActive : itemIdle}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: projectDotColor({
                            key: p.key,
                            color: p.color,
                            dark: isDark,
                          }),
                        }}
                      />
                      <span className="truncate">{p.name}</span>
                    </button>
                  );
                })
              )}
            </>
          )}
        </>
      )}
      </aside>
    </>
  );
}
