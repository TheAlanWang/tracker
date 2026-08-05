-- Keyset pagination on comments: WHERE task_id = ?
-- ORDER BY created_at DESC, id DESC LIMIT n (scans backward for ASC).
create index comments_task_id_created_at_idx
  on comments (task_id, created_at desc, id desc);

-- comments_issue_id_idx predates the issues→tasks rename (it was never
-- renamed with its siblings) and is now a redundant prefix of the
-- composite above.
drop index if exists comments_issue_id_idx;
