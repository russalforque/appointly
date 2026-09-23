-- Records agreement to the Terms of Service and Privacy Policy, in the two places where
-- consent is actually given: creating an account, and paying for a subscription.
--
-- The checkboxes in the UI are only a prompt; what matters in a dispute is a row saying
-- when the agreement happened and which version of the text was on screen at the time.
-- The version is the "Last updated" date shipped in src/pages/legal/LegalLayout.tsx.

-- ---------------------------------------------------------------------------
-- 1. Sign-up acceptance
-- ---------------------------------------------------------------------------

alter table profiles add column if not exists terms_accepted_at timestamptz;
alter table profiles add column if not exists terms_version text;

alter table profiles drop constraint if exists profiles_terms_version_len;
alter table profiles add constraint profiles_terms_version_len
  check (terms_version is null or length(terms_version) <= 64);

-- The register form puts the stamp in the sign-up metadata; this carries it onto the profile
-- so the record survives independently of auth.users.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, terms_accepted_at, terms_version)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    (new.raw_user_meta_data ->> 'terms_accepted_at')::timestamptz,
    left(new.raw_user_meta_data ->> 'terms_version', 64)
  );
  return new;
end $$;

-- Accounts created between the register form shipping and this migration running already
-- carry the stamp in their metadata.
update profiles p
   set terms_accepted_at = (u.raw_user_meta_data ->> 'terms_accepted_at')::timestamptz,
       terms_version     = left(u.raw_user_meta_data ->> 'terms_version', 64)
  from auth.users u
 where u.id = p.id
   and p.terms_accepted_at is null
   and u.raw_user_meta_data ? 'terms_accepted_at';

-- ---------------------------------------------------------------------------
-- 2. Subscription acceptance
-- ---------------------------------------------------------------------------

alter table subscription_payments add column if not exists terms_accepted_at timestamptz;
alter table subscription_payments add column if not exists terms_version text;

-- Existing submitted payments predate the checkbox. Their submission is the best evidence
-- of agreement we have, and leaving them null would break the constraint below.
update subscription_payments
   set terms_accepted_at = submitted_at,
       terms_version = coalesce(terms_version, 'pre-acceptance-record')
 where status <> 'draft' and terms_accepted_at is null and submitted_at is not null;

-- A submitted payment always carries its consent, the same way it carries its evidence.
alter table subscription_payments drop constraint if exists subscription_payments_terms_accepted;
alter table subscription_payments add constraint subscription_payments_terms_accepted
  check (status = 'draft' or terms_accepted_at is not null);

-- ---------------------------------------------------------------------------
-- 3. submit_subscription_payment() now requires acceptance
-- ---------------------------------------------------------------------------

-- Dropped rather than replaced: the two extra parameters change the signature, and leaving
-- the old five-argument version in place would make the call ambiguous.
drop function if exists submit_subscription_payment(uuid, text, date, text, text);

create function submit_subscription_payment(
  p_payment_id uuid,
  p_transaction_ref text,
  p_payment_date date,
  p_proof_path text,
  p_notes text default null,
  p_terms_accepted boolean default false,
  p_terms_version text default null
) returns subscription_payments
language plpgsql security definer set search_path = public as $$
declare
  v_row subscription_payments;
  v_plan plans;
  v_txn text := nullif(btrim(p_transaction_ref), '');
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  -- Runs before the row is locked, since it may clear this very draft when it is stale.
  perform expire_stale_subscription_payments();

  select * into v_row from subscription_payments where id = p_payment_id for update;
  if not found then raise exception 'This payment session has expired. Please start the payment again.'; end if;
  if not is_business_admin(v_row.business_id) then
    raise exception 'You do not have permission to submit this payment';
  end if;
  if v_row.status <> 'draft' then raise exception 'This payment has already been submitted'; end if;

  -- The checkbox is enforced here too, so consent is recorded even if the form is bypassed.
  if p_terms_accepted is not true then
    raise exception 'Please accept the subscription terms to continue';
  end if;

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
         terms_accepted_at = now(),
         terms_version = left(nullif(btrim(p_terms_version), ''), 64),
         subscription_id = coalesce(subscription_id, (select id from subscriptions where business_id = v_row.business_id)),
         status = 'pending',
         submitted_at = now(),
         user_id = auth.uid()
   where id = v_row.id
   returning * into v_row;

  insert into payment_audit_log (payment_id, business_id, actor_id, action, detail)
  values (v_row.id, v_row.business_id, auth.uid(), 'payment_submitted',
          jsonb_build_object('reference', v_row.payment_reference, 'plan_id', v_row.plan_id,
                             'amount_cents', v_row.amount_cents,
                             'terms_version', v_row.terms_version));

  insert into notifications (business_id, type, title, message)
  values (v_row.business_id, 'payment_submitted', 'Payment submitted',
          'Your ' || v_plan.name || ' payment (' || v_row.payment_reference ||
          ') was received and is waiting for verification.');

  return v_row;
end $$;

revoke execute on function submit_subscription_payment from public, anon;
grant execute on function submit_subscription_payment to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Admins see the acceptance alongside the payment they are verifying
-- ---------------------------------------------------------------------------

-- Dropped rather than replaced: the returned columns change, which a replace cannot do.
drop function if exists admin_list_subscription_payments(text);

create function admin_list_subscription_payments(p_status text default null)
returns table (
  id uuid, business_id uuid, business_name text, owner_name text, owner_email text,
  plan_id text, plan_name text, amount_cents int, currency text, billing_interval text,
  payment_method text, payment_reference text, customer_transaction_reference text,
  payment_date date, proof_path text, notes text, status text, rejection_reason text,
  submitted_at timestamptz, verified_at timestamptz, rejected_at timestamptz,
  terms_accepted_at timestamptz, terms_version text
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
           p.submitted_at, p.verified_at, p.rejected_at,
           p.terms_accepted_at, p.terms_version
      from subscription_payments p
      join businesses b on b.id = p.business_id
      left join plans pl on pl.id = p.plan_id
      left join profiles pr on pr.id = p.user_id
      left join auth.users u on u.id = p.user_id
     where p.status <> 'draft'
       and (p_status is null or p.status::text = p_status)
     order by case when p.status = 'pending' then 0 else 1 end, p.submitted_at desc;
end $$;

revoke execute on function admin_list_subscription_payments from public, anon;
grant execute on function admin_list_subscription_payments to authenticated;
