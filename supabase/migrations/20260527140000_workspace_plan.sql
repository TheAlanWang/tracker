-- ─── workspace plan ───
-- Subscription tier. v1 supports two values; Stripe integration will
-- flip this column via webhook in a later phase. Manual SQL upgrade is
-- the only path to Pro until then.
alter table workspaces
  add column plan text not null default 'free'
  check (plan in ('free', 'pro'));
