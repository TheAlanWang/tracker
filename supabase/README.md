# Supabase migrations

Tracker uses Supabase for Postgres + Auth + Storage + Realtime. Schema
changes live in `migrations/` as timestamped SQL files that are applied
in lexical order — both to the local Docker stack and to the Cloud
project.

The Supabase CLI is **not** linked to the Cloud project, so syncing prod
is a copy-paste-into-Dashboard step (see [Apply to Cloud](#apply-to-cloud)).

## Where things live

| | |
|---|---|
| `migrations/` | Timestamped SQL files, applied in order |
| `config.toml` | Local Docker stack config (ports, auth providers) |
| `snippets/` | Ad-hoc one-off SQL kept around for reference |
| `seed.sql` *(optional)* | Demo data; not required for fresh dev |

## Naming convention

`YYYYMMDDhhmmss_snake_case_description.sql`, UTC. Multiple migrations on
the same day disambiguate via `HHMMSS` — pick readable interval steps
(`060000`, `120000`, `180000`) over raw seconds. Example:
`20260520160000_task_images_bucket.sql`.

Either hand-write the filename or let the CLI scaffold one:

```bash
supabase migration new task_images_bucket
```

## Apply to local Docker

The local stack runs via `supabase start` (or wraps in `make dev`).
Studio is at <http://127.0.0.1:54323>.

There are two ways to apply a new migration, and the choice depends on
whether you care about your local dogfood data:

### Path A — preserve local data (recommended for daily dev)

Open Studio → **SQL Editor** → New query → paste the migration's SQL →
Run.

This is the "manual" path but it's safe: only your new statements
execute, nothing else is touched.

### Path B — full reset (clean slate)

```bash
make migrate    # = supabase db reset
```

**Destructive.** Drops the `public` schema and re-runs every migration
from scratch, then optionally applies `supabase/seed.sql` via `make
seed`. Use when:

- You're starting fresh on a new machine
- You've been editing the *latest* migration in place (instead of adding
  a new one) and want to re-test
- Your local data is throwaway

Don't `make migrate` if you have local workspaces / tasks you care about.

## Apply to Cloud

The CLI is **not** linked (`supabase migration list` errors with "Cannot
find project ref"). Until that changes, sync is manual:

1. Open the Cloud Dashboard for the tracker project
2. Left nav → **SQL Editor** → New query
3. Paste the migration SQL → **Run**
4. Verify in the relevant section (Storage / Auth / Table Editor)

For Storage bucket migrations specifically, confirm in Dashboard →
**Storage** that the new bucket shows up with the expected public flag /
size limit / mime types.

> If we eventually run `supabase link --project-ref <ref>`, `supabase db
> push` will apply pending migrations automatically. Trade-off: needs
> the project's Postgres password, which lives with whoever owns the
> Cloud project.

## Conventions that have bitten us

- **Idempotent SQL.** Use `create … if not exists`, `drop policy if
  exists … ; create policy …`, `insert … on conflict (id) do update`.
  Migrations re-run on `db reset`; non-idempotent statements fail the
  second time. See `20260518180000_avatars_bucket.sql` /
  `20260520160000_task_images_bucket.sql` for the Storage-bucket
  pattern (drop + recreate policies, upsert the bucket row).
- **Mirror existing files for similar objects.** New Storage bucket?
  Copy the avatars bucket migration and tweak. New table with
  workspace-scoped RLS? Grep for an existing `using (exists (select 1
  from workspace_members …))` and follow that shape. Consistency >
  cleverness.
- **Never edit a migration after it's been applied to Cloud.** Add a
  new migration that supersedes it. Editing in place means Cloud and
  local drift (Cloud already ran v1, local `db reset` runs the new v2 —
  Cloud never gets v2).
- **Storage buckets need policies + bucket row + (sometimes) mime
  whitelist.** A bucket without `select`/`insert` policies will reject
  every request even if it's marked `public`. The `public` flag only
  controls the URL prefix; RLS still gates the row.
- **`auth.uid()` is null for service-role queries.** RLS policies that
  do `auth.uid()::text = (storage.foldername(name))[1]` work for end
  users hitting the API with their JWT, but fail silently for any
  server-side code using the service role. Use the admin client only
  when you mean it.

## Adding a new migration: end-to-end checklist

1. **Write the SQL.** Either `supabase migration new <name>` or
   hand-create `migrations/YYYYMMDD000000_<name>.sql`. Keep statements
   idempotent.
2. **Apply locally** via Studio SQL Editor (Path A) or `make migrate`
   (Path B). Verify in Studio that the change landed.
3. **Test the feature end-to-end** with `make dev`.
4. **Commit** the migration file with the related code change. Don't
   leave the migration uncommitted — Cloud sync is the next step.
5. **Apply to Cloud** via Dashboard SQL Editor. Verify in Cloud Studio.
6. **Push the commit** (Vercel + Fly redeploy the app code; the schema
   you just pushed in step 5 is already there waiting).

Steps 5 and 6 are independent on the timeline but must both happen for
the deploy to work. Push code before applying SQL and you risk a brief
window where the app calls a column / bucket that doesn't exist yet.
