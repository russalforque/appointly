-- Switches billing from PayMongo to Xendit, and makes the columns provider-neutral so a
-- future switch is a config change rather than another migration.
--
--   paymongo_checkout_id -> checkout_ref  (Xendit invoice id, e.g. '65a1...')
--   paymongo_payment_id  -> payment_ref   (Xendit payment id / channel reference)
--
-- The Edge Functions in supabase/functions/xendit-* are the only writers.

alter table subscriptions rename column paymongo_checkout_id to checkout_ref;
alter table subscriptions rename column paymongo_payment_id to payment_ref;

alter index subscriptions_paymongo_checkout_id_idx rename to subscriptions_checkout_ref_idx;

-- Which gateway issued checkout_ref, so old PayMongo rows stay readable after the switch.
alter table subscriptions add column provider text not null default 'xendit'
  check (provider in ('paymongo', 'xendit'));
update subscriptions set provider = 'paymongo' where checkout_ref is not null;

comment on column subscriptions.checkout_ref is 'Gateway checkout/invoice id — see subscriptions.provider';
comment on column subscriptions.payment_ref is 'Gateway payment id, set once the payment is confirmed';
