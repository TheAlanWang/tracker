-- ─── workspace feature flags ───
-- Per-workspace toggles for in-progress / opt-in features. Owners flip
-- these in Workspace Settings. Default '{}' means everything is off.
--
-- Keys we currently use:
--   - goals (bool): show the Goals nav entry + page. Off by default while
--     the feature is still being tuned.
--
-- jsonb keeps this extensible without further migrations as more
-- experiments land.

alter table workspaces
  add column features jsonb not null default '{}'::jsonb;
