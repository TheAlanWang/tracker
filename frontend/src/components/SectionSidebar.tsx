// SectionSidebar — the tier-2 sub-rail. Sits next to SettingsSidebar
// when a page has registered in-page sections via useSectionSidebar().
//
// Layout: ABSOLUTE-positioned overlay, NOT a flex item. This means it
// floats over the left edge of <main> without resizing or shifting the
// main content. The trade-off — on narrow viewports it might cover a
// few pixels of the page's left margin — is acceptable because settings
// pages center their content (`max-w-3xl mx-auto`) and the centered
// block sits well to the right of where this rail ends.
//
// Position adapts to SettingsSidebar's collapsed state: when SettingsSidebar
// is the 48px collapsed rail, this slides to `left: 3rem`; when expanded,
// `left: 14rem`. Animated with transition-[left] so the slide matches
// SettingsSidebar's own width transition.
//
// Click → smooth scroll to <section id=...>. Doesn't change the URL or
// route — purely intra-page navigation, like an MDN table of contents.

import { useSectionSidebarValue } from "@/hooks/useSectionSidebar";

export function SectionSidebar({
  siblingCollapsed,
}: {
  siblingCollapsed: boolean;
}) {
  const config = useSectionSidebarValue();
  if (!config || config.sections.length === 0) return null;

  return (
    <aside
      className={`absolute top-0 bottom-0 ${
        siblingCollapsed ? "left-12" : "left-56"
      } w-40 bg-white dark:bg-neutral-900 p-2 hidden lg:flex flex-col gap-0.5 overflow-y-auto z-10 transition-[left] duration-200 ease-out`}
    >
      {config.title && (
        // Mirror SettingsSidebar's section-label style (small uppercase
        // tracking-wide grey) so this whole rail reads as one section
        // pulled out of <SettingsSidebar>, not a separate sidebar with
        // its own design language. `pt-9` keeps the top y-aligned with
        // the "ACCOUNT" label across the divider — no more empty space
        // void at the top.
        <p className="px-2 pt-9 pb-1.5 text-[10px] uppercase tracking-[0.12em] text-slate-400 dark:text-neutral-500 font-semibold">
          {config.title}
        </p>
      )}
      {config.sections.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => {
            const el = document.getElementById(s.id);
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          }}
          // pl-4 (16px) — 8px more than the title's px-2 left padding.
          // SettingsSidebar uses pl-7 because its section labels have
          // a 14px icon + 6px gap before the text; this rail's title has
          // no icon, so items only need a modest indent to read as
          // subordinate. All items share the same neutral styling — the
          // section's own <h2> already colors "Danger Zone" red in the
          // main content area, so the sub-nav doesn't need to repeat it
          // (less visual noise; consistent rhythm in the rail).
          className="flex items-center w-full text-left rounded-md pl-4 pr-2 py-1.5 text-sm font-normal tracking-tight transition-colors text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-100 hover:bg-slate-100 dark:hover:bg-neutral-800"
        >
          {s.label}
        </button>
      ))}
    </aside>
  );
}
