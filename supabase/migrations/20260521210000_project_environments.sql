-- Structured environment links on projects (production / staging / dev / repo /
-- docs / design / other). Stored as JSONB array so the schema is flexible
-- enough to add per-environment metadata later (icons, owner, last-checked
-- timestamps) without another migration, but the application layer (Pydantic
-- on the backend) enforces strict shape via the ProjectEnvironment schema.
--
-- Why JSONB and not a separate `project_environments` table: at the current
-- scale (workspace × ~10 projects × ~3 environments = ~30 rows total) the
-- relational table's benefits (constraints, joins, indexable per-env queries)
-- don't yet outweigh the cost of a second table + RLS policies. The JSONB
-- column inherits workspace-scoped RLS from `projects` automatically.
--
-- AI-friendliness: get_project() now returns environments as structured JSON
-- so future MCP / agent tools can filter `type == 'production'` directly,
-- without parsing markdown.

alter table projects
  add column if not exists environments jsonb not null default '[]'::jsonb;
