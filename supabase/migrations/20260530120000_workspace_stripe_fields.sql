-- Stripe billing identifiers on workspaces.
--
-- Set by the billing flow / webhook (service-role, bypasses RLS):
--   stripe_customer_id      created on first Checkout, reused across upgrades
--   stripe_subscription_id  the active Pro subscription; cleared on cancel
-- The `plan` column (free/pro) already exists; the webhook flips it.

alter table workspaces
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;
