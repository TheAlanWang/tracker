-- ─── projects.color ───
-- Optional user-set color (hex like '#3b82f6'). When null, the frontend
-- falls back to a hash-derived hue from the project key — so existing
-- projects keep their visual identity without a backfill.

alter table projects
  add column color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$');
