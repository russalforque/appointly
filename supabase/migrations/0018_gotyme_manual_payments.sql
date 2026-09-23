-- Manual GoTyme Bank / QR Ph subscription payments.
--
-- No payment gateway is involved: the customer pays from their own banking app, submits the
-- transaction reference plus a receipt, and a platform admin verifies it by hand. Nothing here
-- ever marks a payment as paid on its own.
--
-- All state changes go through security-definer RPCs so the amount, the status, the business and
-- the verifying admin are always decided server-side. Clients get SELECT only.

-- ---------------------------------------------------------------------------
-- 1. Platform admins (Appointly staff, distinct from a business's own admins)
-- ---------------------------------------------------------------------------

alter table profiles add column if not exists is_platform_admin boolean not null default false;

create function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_platform_admin from profiles where id = auth.uid()), false)
$$;
revoke execute on function is_platform_admin from anon;
grant execute on function is_platform_admin to authenticated;

-- ---------------------------------------------------------------------------
-- 2. GoTyme payment details, editable by a platform admin without a deploy
-- ---------------------------------------------------------------------------

create table payment_settings (
  id text primary key default 'gotyme' check (id = 'gotyme'),
  bank_name text not null default 'GoTyme Bank',
  account_name text not null default '',
  account_number text not null default '',
  qr_image_url text,
  instructions text not null default '',
  is_active boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null
);
create trigger t_upd before update on payment_settings for each row execute function set_updated_at();

insert into payment_settings (id, instructions) values (
  'gotyme',
  E'1. Open your GoTyme Bank app, or any bank or e-wallet app that supports QR Ph.\n'
  '2. Scan the QR code, or transfer to the account details shown.\n'
  '3. Enter the exact amount.\n'
  '4. Put your payment reference in the notes or message field.\n'
  '5. Save the receipt and upload it on this page.'
);

-- ---------------------------------------------------------------------------
-- 3. Payment records
-- ---------------------------------------------------------------------------

-- 'draft' exists so a reference number can be reserved and shown to the customer *before*
-- they transfer the money. Drafts are invisible to admins and to payment history, and are
-- cleaned up by expire_stale_subscription_payments().
create type subscription_payment_status as enum ('draft', 'pending', 'approved', 'rejected', 'expired');

create table subscription_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  subscription_id uuid references subscriptions(id) on delete set null,
  plan_id text not null references plans(id),
  payment_method text not null default 'gotyme' check (payment_method in ('gotyme')),
  amount_cents int not null check (amount_cents >= 0),
  currency text not null default 'PHP',
  billing_interval text not null check (billing_interval in ('month', 'year')),
  payment_reference text not null unique,        -- ours, shown to the customer (APT-…)
  customer_transaction_reference text,           -- theirs, from the bank receipt
  payment_date date,
  proof_path text,                               -- object path inside the payment-proofs bucket
  notes text,
  status subscription_payment_status not null default 'draft',
  rejection_reason text,
  submitted_at timestamptz,
  verified_at timestamptz,
  rejected_at timestamptz,
  verified_by uuid references profiles(id) on delete set null,
  rejected_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A submitted payment always carries its evidence.
  check (status = 'draft' or (customer_transaction_reference is not null
         and payment_date is not null and proof_path is not null and submitted_at is not null))
);
create trigger t_upd before update on subscription_payments for each row execute function set_updated_at();

create index on subscription_payments (business_id, submitted_at desc);
create index on subscription_payments (user_id);
create index on subscription_payments (subscription_id);
create index on subscription_payments (status, submitted_at desc);
create index on subscription_payments (submitted_at desc);
-- The bank's reference can only back one live payment, which is what makes a re-submission
-- of the same receipt a hard duplicate rather than a warning.
create unique index subscription_payments_txn_ref_live_idx
  on subscription_payments (business_id, lower(customer_transaction_reference))
  where status in ('pending', 'approved');

-- Lightweight audit trail for this workflow only.
create table payment_audit_log (
  id bigserial primary key,
  payment_id uuid references subscription_payments(id) on delete set null,
  business_id uuid references businesses(id) on delete set null,
  actor_id uuid references profiles(id) on delete set null,
  action text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on payment_audit_log (payment_id, created_at desc);
create index on payment_audit_log (business_id, created_at desc);

-- GoTyme joins the gateways a subscription may have been paid through.
alter table subscriptions drop constraint subscriptions_provider_check;
alter table subscriptions add constraint subscriptions_provider_check
  check (provider in ('paymongo', 'xendit', 'gotyme'));

-- ---------------------------------------------------------------------------
-- 4. Payment references: APT-YYYYMMDD-XXXXXX
-- ---------------------------------------------------------------------------

-- Crockford-style alphabet: no I/L/O/0/1, so a reference survives being read off a screen
-- and typed into a banking app's notes field. 31^6 ≈ 887M values per day.
create function gen_payment_reference() returns text
language plpgsql volatile set search_path = public as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  suffix text := '';
  bytes bytea := gen_random_bytes(6);
begin
  for i in 0..5 loop
    suffix := suffix || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return 'APT-' || to_char(now() at time zone 'Asia/Manila', 'YYYYMMDD') || '-' || suffix;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Expiry (no scheduler: these run lazily from the RPCs below)
-- ---------------------------------------------------------------------------

create function default_payment_expiry_days() returns int language sql immutable as $$ select 14 $$;

-- A pending payment nobody verified within the window stops blocking new submissions, and
-- abandoned drafts (reference reserved, money never sent) are dropped.
create function expire_stale_subscription_payments() returns void
language plpgsql security definer set search_path = public as $$
begin
  update subscription_payments
     set status = 'expired'
   where status = 'pending'
     and submitted_at < now() - make_interval(days => default_payment_expiry_days());
  delete from subscription_payments
   where status = 'draft' and created_at < now() - interval '2 days';
end $$;

-- An active subscription whose paid period has run out loses access, same as a failed renewal.
create function expire_due_subscriptions() returns void
language sql security definer set search_path = public as $$
  update subscriptions
     set status = 'past_due'
   where status = 'active' and current_period_end is not null and current_period_end < now()
$$;

revoke execute on function expire_stale_subscription_payments, expire_due_subscriptions from public, anon;
grant execute on function expire_stale_subscription_payments, expire_due_subscriptions to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Customer: reserve a reference, then submit the payment
-- ---------------------------------------------------------------------------

-- Step 1. Reserves the payment record (and its reference) so the customer can quote it in the
-- bank transfer. The amount is copied from the plans table; nothing is taken from the client
-- but the business and the plan, and the business is re-checked against the caller's membership.
create function start_subscription_payment(p_business_id uuid, p_plan_id text)
returns subscription_payments
language plpgsql security definer set search_path = public as $$
declare
  v_plan plans;
  v_row subscription_payments;
  v_settings payment_settings;
  v_sub_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not is_business_admin(p_business_id) then
    raise exception 'You do not have permission to pay for this business';
  end if;

  select * into v_settings from payment_settings where id = 'gotyme';
  if not found or not v_settings.is_active then
    raise exception 'GoTyme payments are unavailable right now. Please try again later.';
  end if;

  select * into v_plan from plans where id = p_plan_id and is_active;
  if not found then raise exception 'That plan is no longer available'; end if;

  perform expire_stale_subscription_payments();

  if exists (select 1 from subscription_payments where business_id = p_business_id and status = 'pending') then
    raise exception 'You already have a payment awaiting verification';
  end if;

  -- Reuse an existing draft so re-opening the page keeps showing the same reference, and
  -- re-price it in case the plan changed in the meantime.
  select * into v_row from subscription_payments
   where business_id = p_business_id and plan_id = v_plan.id and status = 'draft'
   order by created_at desc limit 1;

  if found then
    update subscription_payments
       set amount_cents = v_plan.price_cents, currency = v_plan.currency,
           billing_interval = v_plan.interval, user_id = auth.uid()
     where id = v_row.id
     returning * into v_row;
    return v_row;
  end if;

  select id into v_sub_id from subscriptions where business_id = p_business_id;

  -- The retry only guards the (astronomically unlikely) reference collision.
  for i in 1..5 loop
    begin
      insert into subscription_payments (
        business_id, user_id, subscription_id, plan_id, payment_method,
        amount_cents, currency, billing_interval, payment_reference, status
      ) values (
        p_business_id, auth.uid(), v_sub_id, v_plan.id, 'gotyme',
        v_plan.price_cents, v_plan.currency, v_plan.interval, gen_payment_reference(), 'draft'
      ) returning * into v_row;
      exit;
    exception when unique_violation then
      if i = 5 then raise; end if;
    end;
  end loop;

  return v_row;
end $$;

-- Step 2. Attaches the receipt and hands the payment to an admin for verification.
create function submit_subscription_payment(
  p_payment_id uuid,
  p_transaction_ref text,
  p_payment_date date,
  p_proof_path text,
  p_notes text default null
) returns subscription_payments
language plpgsql security definer set search_path = public as $$
declare
  v_row subscription_payments;
  v_plan plans;
  v_txn text := nullif(btrim(p_transaction_ref), '');
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_row from subscription_payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if not is_business_admin(v_row.business_id) then
    raise exception 'You do not have permission to submit this payment';
  end if;
  if v_row.status <> 'draft' then raise exception 'This payment has already been submitted'; end if;

  select * into v_plan from plans where id = v_row.plan_id and is_active;
  if not found then raise exception 'That plan is no longer available'; end if;
  -- The amount is re-read from the trusted plan catalogue; the client never supplies it.
  if v_row.amount_cents <> v_plan.price_cents then
    raise exception 'The plan price changed. Please start the payment again.';
  end if;

  if v_txn is null or length(v_txn) < 4 or length(v_txn) > 64 then
    raise exception 'Enter the reference number from your bank receipt (4-64 characters)';
  end if;
  if p_payment_date is null or p_payment_date > v_today then
    raise exception 'The payment date cannot be in the future';
  end if;
  if p_payment_date < v_today - 60 then
    raise exception 'The payment date is too far in the past';
  end if;
  -- The receipt must sit under this business's own folder for this payment, matching the
  -- storage policy, so a submitted path can never point at someone else's file.
  if p_proof_path is null
     or p_proof_path not like v_row.business_id::text || '/' || v_row.id::text || '/%'
     or array_length(string_to_array(p_proof_path, '/'), 1) <> 3
     or split_part(p_proof_path, '/', 3) = '' then
    raise exception 'Upload a proof of payment before submitting';
  end if;

  perform expire_stale_subscription_payments();

  if exists (
    select 1 from subscription_payments
     where business_id = v_row.business_id and status = 'pending' and id <> v_row.id
  ) then
    raise exception 'You already have a payment awaiting verification';
  end if;
  if exists (
    select 1 from subscription_payments
     where business_id = v_row.business_id and id <> v_row.id
       and lower(customer_transaction_reference) = lower(v_txn)
       and status in ('pending', 'approved')
  ) then
    raise exception 'That transaction reference has already been submitted';
  end if;

  update subscription_payments
     set customer_transaction_reference = v_txn,
         payment_date = p_payment_date,
         proof_path = p_proof_path,
         notes = nullif(btrim(p_notes), ''),
         subscription_id = coalesce(subscription_id, (select id from subscriptions where business_id = v_row.business_id)),
         status = 'pending',
         submitted_at = now(),
         user_id = auth.uid()
   where id = v_row.id
   returning * into v_row;

  insert into payment_audit_log (payment_id, business_id, actor_id, action, detail)
  values (v_row.id, v_row.business_id, auth.uid(), 'payment_submitted',
          jsonb_build_object('reference', v_row.payment_reference, 'plan_id', v_row.plan_id,
                             'amount_cents', v_row.amount_cents));

  insert into notifications (business_id, type, title, message)
  values (v_row.business_id, 'payment_submitted', 'Payment submitted',
          'Your ' || v_plan.name || ' payment (' || v_row.payment_reference ||
          ') was received and is waiting for verification.');

  return v_row;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Admin: approve / reject
-- ---------------------------------------------------------------------------

create function approve_subscription_payment(p_payment_id uuid) returns subscription_payments
language plpgsql security definer set search_path = public as $$
declare
  v_pay subscription_payments;
  v_plan plans;
  v_sub subscriptions;
  v_start timestamptz;
  v_end timestamptz;
  v_has_sub boolean;
begin
  if not is_platform_admin() then raise exception 'You do not have permission to verify payments'; end if;

  select * into v_pay from subscription_payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if v_pay.status = 'approved' then raise exception 'This payment was already approved'; end if;
  if v_pay.status = 'rejected' then raise exception 'This payment was already rejected'; end if;
  if v_pay.status = 'expired' then raise exception 'This payment has expired and cannot be approved'; end if;
  if v_pay.status = 'draft' then raise exception 'This payment has not been submitted yet'; end if;

  if not exists (select 1 from businesses where id = v_pay.business_id) then
    raise exception 'The business for this payment no longer exists';
  end if;

  select * into v_plan from plans where id = v_pay.plan_id;
  if not found then raise exception 'The plan on this payment no longer exists'; end if;
  -- The amount was copied from the plan at reservation time; re-check it before granting access.
  if v_pay.amount_cents <> v_plan.price_cents or v_pay.currency <> v_plan.currency then
    raise exception 'The paid amount no longer matches the plan price. Reject this payment instead.';
  end if;
  if nullif(btrim(v_pay.customer_transaction_reference), '') is null or v_pay.proof_path is null then
    raise exception 'This payment is missing its reference or receipt';
  end if;

  select * into v_sub from subscriptions where business_id = v_pay.business_id for update;
  v_has_sub := found;

  -- Renewing the same plan while it is still running extends it; anything else starts now.
  -- There is one subscription row per business, so periods can never overlap.
  if v_has_sub and v_sub.status = 'active' and v_sub.plan_id = v_plan.id
     and v_sub.current_period_end is not null and v_sub.current_period_end > now() then
    v_start := v_sub.current_period_end;
  else
    v_start := now();
  end if;
  v_end := v_start + case v_plan.interval when 'year' then interval '1 year' else interval '1 month' end;

  if v_has_sub then
    update subscriptions
       set plan_id = v_plan.id, status = 'active', provider = 'gotyme',
           current_period_start = v_start, current_period_end = v_end,
           checkout_ref = null, payment_ref = v_pay.payment_reference
     where id = v_sub.id
     returning * into v_sub;
  else
    insert into subscriptions (business_id, user_id, plan_id, status, provider,
                               current_period_start, current_period_end, payment_ref)
    values (v_pay.business_id, v_pay.user_id, v_plan.id, 'active', 'gotyme',
            v_start, v_end, v_pay.payment_reference)
    returning * into v_sub;
  end if;

  update subscription_payments
     set status = 'approved', verified_at = now(), verified_by = auth.uid(),
         subscription_id = v_sub.id, rejection_reason = null
   where id = v_pay.id
   returning * into v_pay;

  insert into payment_audit_log (payment_id, business_id, actor_id, action, detail)
  values (v_pay.id, v_pay.business_id, auth.uid(), 'payment_approved',
          jsonb_build_object('reference', v_pay.payment_reference, 'amount_cents', v_pay.amount_cents)),
         (v_pay.id, v_pay.business_id, auth.uid(), 'subscription_activated',
          jsonb_build_object('plan_id', v_plan.id, 'period_start', v_start, 'period_end', v_end));

  insert into notifications (business_id, type, title, message)
  values (v_pay.business_id, 'payment_approved', 'Payment verified',
          'Your payment has been verified and your ' || v_plan.name ||
          ' subscription is now active until ' || to_char(v_end at time zone 'Asia/Manila', 'Mon DD, YYYY') || '.');

  return v_pay;
end $$;

create function reject_subscription_payment(p_payment_id uuid, p_reason text)
returns subscription_payments
language plpgsql security definer set search_path = public as $$
declare
  v_pay subscription_payments;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if not is_platform_admin() then raise exception 'You do not have permission to verify payments'; end if;
  if v_reason is null or length(v_reason) < 5 then raise exception 'A rejection reason is required'; end if;

  select * into v_pay from subscription_payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if v_pay.status = 'approved' then raise exception 'This payment was already approved'; end if;
  if v_pay.status = 'rejected' then raise exception 'This payment was already rejected'; end if;
  if v_pay.status = 'draft' then raise exception 'This payment has not been submitted yet'; end if;

  update subscription_payments
     set status = 'rejected', rejection_reason = v_reason, rejected_at = now(), rejected_by = auth.uid()
   where id = v_pay.id
   returning * into v_pay;

  insert into payment_audit_log (payment_id, business_id, actor_id, action, detail)
  values (v_pay.id, v_pay.business_id, auth.uid(), 'payment_rejected',
          jsonb_build_object('reference', v_pay.payment_reference, 'reason', v_reason));

  insert into notifications (business_id, type, title, message)
  values (v_pay.business_id, 'payment_rejected', 'Payment rejected',
          'Your payment ' || v_pay.payment_reference || ' was rejected: ' || v_reason ||
          ' You can submit a new payment from the Billing page.');

  return v_pay;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Admin: read across businesses, and edit the GoTyme details
-- ---------------------------------------------------------------------------

create function admin_list_subscription_payments(p_status text default null)
returns table (
  id uuid, business_id uuid, business_name text, owner_name text, owner_email text,
  plan_id text, plan_name text, amount_cents int, currency text, billing_interval text,
  payment_method text, payment_reference text, customer_transaction_reference text,
  payment_date date, proof_path text, notes text, status text, rejection_reason text,
  submitted_at timestamptz, verified_at timestamptz, rejected_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'You do not have permission to view payments'; end if;
  perform expire_stale_subscription_payments();
  perform expire_due_subscriptions();

  return query
    select p.id, p.business_id, b.name, pr.full_name, u.email::text,
           p.plan_id, pl.name, p.amount_cents, p.currency, p.billing_interval,
           p.payment_method, p.payment_reference, p.customer_transaction_reference,
           p.payment_date, p.proof_path, p.notes, p.status::text, p.rejection_reason,
           p.submitted_at, p.verified_at, p.rejected_at
      from subscription_payments p
      join businesses b on b.id = p.business_id
      left join plans pl on pl.id = p.plan_id
      left join profiles pr on pr.id = p.user_id
      left join auth.users u on u.id = p.user_id
     where p.status <> 'draft'
       and (p_status is null or p.status::text = p_status)
     order by case when p.status = 'pending' then 0 else 1 end, p.submitted_at desc;
end $$;

create function admin_payment_counts()
returns table (pending bigint, approved bigint, rejected bigint, expired bigint, total bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'You do not have permission to view payments'; end if;
  return query
    select count(*) filter (where status = 'pending'),
           count(*) filter (where status = 'approved'),
           count(*) filter (where status = 'rejected'),
           count(*) filter (where status = 'expired'),
           count(*)
      from subscription_payments
     where status <> 'draft';
end $$;

create function update_payment_settings(
  p_account_name text, p_account_number text, p_qr_image_url text,
  p_instructions text, p_is_active boolean
) returns payment_settings
language plpgsql security definer set search_path = public as $$
declare v_row payment_settings;
begin
  if not is_platform_admin() then raise exception 'You do not have permission to change payment settings'; end if;
  if p_is_active and (nullif(btrim(p_account_name), '') is null or nullif(btrim(p_account_number), '') is null) then
    raise exception 'An account name and number are required before GoTyme payments can be switched on';
  end if;
  update payment_settings
     set account_name = btrim(p_account_name), account_number = btrim(p_account_number),
         qr_image_url = nullif(btrim(p_qr_image_url), ''), instructions = btrim(p_instructions),
         is_active = p_is_active, updated_by = auth.uid()
   where id = 'gotyme'
   returning * into v_row;

  insert into payment_audit_log (actor_id, action, detail)
  values (auth.uid(), 'payment_settings_updated', jsonb_build_object('is_active', p_is_active));
  return v_row;
end $$;

revoke execute on function start_subscription_payment, submit_subscription_payment,
  approve_subscription_payment, reject_subscription_payment, admin_list_subscription_payments,
  admin_payment_counts, update_payment_settings, gen_payment_reference from public, anon;
grant execute on function start_subscription_payment, submit_subscription_payment,
  approve_subscription_payment, reject_subscription_payment, admin_list_subscription_payments,
  admin_payment_counts, update_payment_settings to authenticated;

-- ---------------------------------------------------------------------------
-- 9. RLS
-- ---------------------------------------------------------------------------

alter table payment_settings enable row level security;
alter table subscription_payments enable row level security;
alter table payment_audit_log enable row level security;

-- Signed-in business owners need the bank details to pay; the public does not.
create policy payment_settings_read on payment_settings for select to authenticated using (true);

-- Read-only for customers. Every write happens in the RPCs above, which bypass RLS, so a
-- customer can never set a status, an amount, or a verifier.
create policy payments_select on subscription_payments for select to authenticated
  using (is_business_member(business_id) or is_platform_admin());

create policy audit_select on payment_audit_log for select to authenticated
  using (is_platform_admin() or (business_id is not null and is_business_member(business_id)));

revoke all on payment_settings, subscription_payments, payment_audit_log from anon;
grant select on payment_settings, subscription_payments, payment_audit_log to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Storage
-- ---------------------------------------------------------------------------

-- Private: receipts are read through short-lived signed URLs only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Path convention: payment-proofs/<business_id>/<payment_id>/<file>
create policy payment_proofs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-proofs' and is_business_admin((storage.foldername(name))[1]::uuid));

create policy payment_proofs_select on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs'
         and (is_platform_admin() or is_business_member((storage.foldername(name))[1]::uuid)));

-- No update or delete policy: a submitted receipt is evidence and stays put.

-- Public bucket for the GoTyme QR image, which every paying customer must be able to see.
insert into storage.buckets (id, name, public) values ('payment-assets', 'payment-assets', true)
on conflict (id) do nothing;

create policy payment_assets_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'payment-assets');
create policy payment_assets_admin_write on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-assets' and is_platform_admin());
create policy payment_assets_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'payment-assets' and is_platform_admin())
  with check (bucket_id = 'payment-assets' and is_platform_admin());
create policy payment_assets_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'payment-assets' and is_platform_admin());
