-- Fuzzy, ranked, cross-entity workspace search.
--
-- Replaces the per-entity ILIKE substring queries in the search service with a
-- single SQL function that scores every match by trigram similarity (so typos
-- still hit) plus a substring bonus, and returns the most relevant rows across
-- projects / tasks / labels / goals / sprints ordered by score.

create extension if not exists pg_trgm;

-- Trigram GIN indexes back ILIKE '%q%' (and the trigram similarity operators),
-- so the substring branch of search stays index-assisted as a workspace grows.
create index if not exists tasks_title_trgm_idx on tasks using gin (title gin_trgm_ops);
create index if not exists tasks_description_trgm_idx on tasks using gin (description gin_trgm_ops);
create index if not exists projects_name_trgm_idx on projects using gin (name gin_trgm_ops);
create index if not exists labels_name_trgm_idx on labels using gin (name gin_trgm_ops);
create index if not exists goals_title_trgm_idx on goals using gin (title gin_trgm_ops);
create index if not exists sprints_name_trgm_idx on sprints using gin (name gin_trgm_ops);

-- search_workspace(p_ws, p_q): ranked matches scoped to one workspace.
-- The caller (backend) verifies workspace membership before invoking this;
-- the function itself filters strictly by p_ws. SECURITY DEFINER so it runs
-- regardless of the caller's RLS context with a pinned search_path.
-- word_similarity(query, doc) scores how well the query matches the best
-- continuous extent of doc, so a short query (possibly mistyped) still hits a
-- long title/description — unlike similarity(), which normalizes over the
-- whole string. We compare it against an explicit 0.3 threshold (rather than
-- the `<%` operator) so the cutoff is self-contained and doesn't depend on the
-- session's pg_trgm.word_similarity_threshold GUC. Matches stay workspace-
-- scoped, so the per-call row set is small.
create or replace function search_workspace(p_ws uuid, p_q text)
returns table (
  type text,
  id uuid,
  label text,
  sublabel text,
  project_key text,
  score real
)
language sql
stable
security definer
set search_path = public
as $$
  with q as (select btrim(p_q) as t)
  select * from (
    -- Projects: match name or key.
    select
      'project'::text as type,
      p.id,
      p.name as label,
      p.key as sublabel,
      p.key as project_key,
      greatest(
        word_similarity(q.t, p.name),
        word_similarity(q.t, p.key),
        case when p.name ilike '%' || q.t || '%' or p.key ilike '%' || q.t || '%' then 0.8 else 0 end
      )::real as score
    from projects p, q
    where p.workspace_id = p_ws
      and (word_similarity(q.t, p.name) > 0.3 or word_similarity(q.t, p.key) > 0.3
           or p.name ilike '%' || q.t || '%' or p.key ilike '%' || q.t || '%')

    union all

    -- Tasks: match title, identifier, or description.
    select
      'task'::text,
      t.id,
      t.title,
      t.identifier,
      pr.key,
      greatest(
        word_similarity(q.t, t.title),
        word_similarity(q.t, t.description),
        word_similarity(q.t, t.identifier),
        case when t.title ilike '%' || q.t || '%'
                  or t.identifier ilike '%' || q.t || '%'
                  or t.description ilike '%' || q.t || '%' then 0.8 else 0 end
      )::real
    from tasks t join projects pr on pr.id = t.project_id, q
    where t.workspace_id = p_ws
      and (word_similarity(q.t, t.title) > 0.3 or word_similarity(q.t, t.description) > 0.3
           or t.title ilike '%' || q.t || '%'
           or t.identifier ilike '%' || q.t || '%'
           or t.description ilike '%' || q.t || '%')

    union all

    -- Labels: match name.
    select
      'label'::text,
      l.id,
      l.name,
      null::text,
      null::text,
      greatest(
        word_similarity(q.t, l.name),
        case when l.name ilike '%' || q.t || '%' then 0.8 else 0 end
      )::real
    from labels l, q
    where l.workspace_id = p_ws
      and (word_similarity(q.t, l.name) > 0.3 or l.name ilike '%' || q.t || '%')

    union all

    -- Goals: match title or description.
    select
      'goal'::text,
      g.id,
      g.title,
      null::text,
      null::text,
      greatest(
        word_similarity(q.t, g.title),
        word_similarity(q.t, g.description),
        case when g.title ilike '%' || q.t || '%'
                  or g.description ilike '%' || q.t || '%' then 0.8 else 0 end
      )::real
    from goals g, q
    where g.workspace_id = p_ws
      and (word_similarity(q.t, g.title) > 0.3 or word_similarity(q.t, g.description) > 0.3
           or g.title ilike '%' || q.t || '%'
           or g.description ilike '%' || q.t || '%')

    union all

    -- Sprints: match name (scoped to the workspace via their project).
    select
      'sprint'::text,
      s.id,
      s.name,
      pr.key,
      pr.key,
      greatest(
        word_similarity(q.t, s.name),
        case when s.name ilike '%' || q.t || '%' then 0.8 else 0 end
      )::real
    from sprints s join projects pr on pr.id = s.project_id, q
    where pr.workspace_id = p_ws
      and (word_similarity(q.t, s.name) > 0.3 or s.name ilike '%' || q.t || '%')
  ) results
  order by score desc, label asc
  limit 25;
$$;

revoke execute on function search_workspace(uuid, text) from public, anon;
grant execute on function search_workspace(uuid, text) to authenticated, service_role;
