-- Fresh-start data reset. Empties every tenant table but leaves the schema,
-- functions, RLS policies, triggers and buckets exactly as they are.
--
-- KEPT ON PURPOSE:
--   plans            - your pricing tiers (seeded by 0011, edited via the admin UI)
--   payment_settings - GoTyme account name/number/QR, typed in by an admin
--   payment-assets   - the QR image those settings point at
--   platform admins  - so you can still sign in to the admin dashboard
--
-- Run in: Supabase Dashboard -> SQL Editor. Take a backup first.

begin;

-- 1. Uploaded files for tenant data. Buckets and policies survive; only objects go.
delete from storage.objects where bucket_id in ('payment-proofs', 'service-images');

-- 2. Every tenant table. CASCADE reaches anything referencing these via businesses.
--    RESTART IDENTITY resets payment_audit_log's bigserial counter to 1.
truncate table
  payment_audit_log,
  subscription_payments,
  notifications,
  bookings,
  customers,
  staff_days_off,
  staff_schedules,
  staff_services,
  staff,
  services,
  business_settings,
  subscriptions,
  business_members,
  businesses
restart identity cascade;

-- 3. Accounts last. Cascades to profiles. Keeps platform admins.
--    To wipe admins too, replace this whole statement with:  delete from auth.users;
delete from auth.users u
 where not exists (
   select 1 from profiles p
    where p.id = u.id
      and p.is_platform_admin
 );

commit;

-- ---------------------------------------------------------------------------
-- Verify: every count should be 0 except the last three.
-- ---------------------------------------------------------------------------
select
  (select count(*) from businesses)            as businesses,
  (select count(*) from bookings)              as bookings,
  (select count(*) from customers)             as customers,
  (select count(*) from services)              as services,
  (select count(*) from staff)                 as staff,
  (select count(*) from subscriptions)         as subscriptions,
  (select count(*) from subscription_payments) as payments,
  (select count(*) from auth.users)            as users_kept,
  (select count(*) from plans)                 as plans_kept,
  (select count(*) from payment_settings)      as settings_kept;
