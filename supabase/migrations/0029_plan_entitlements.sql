-- Plans & entitlements, end to end.
--
-- 0021 made Starter and Business differ by two switches. This migration turns the Business plan
-- into what the pricing page sells, and makes every difference a database rule:
--
--   1. The plan catalogue: capabilities, a Starter staff allowance, and the feature copy.
--   2. Entitlement guards on every table a Business feature writes to.
--   3. The slot engine: staff without a weekly schedule follow the business hours, so Starter
--      (which has no per-staff schedules) can still take bookings for every staff member.
--   4. Subscription lifecycle: upgrades credit unused time, downgrades happen instantly without a
--      payment, and an owner can cancel (or resume) at the end of the paid period.
--   5. Reports, computed server-side behind the analytics capability.
--   6. Customer reminder emails, sent by the booking-reminders Edge Function on a schedule.
--   7. Realtime on subscriptions, so the dashboard unlocks the moment a payment is approved.
--
-- Downgrades never delete anything. Data a lower plan cannot create stays where it is and keeps
-- working; the guards only stop it from being created or changed to a custom value again.

-- ---------------------------------------------------------------------------
-- 1. Plan catalogue
-- ---------------------------------------------------------------------------

-- How many staff can be active (bookable) at once. NULL = unlimited.
alter table plans add column if not exists max_staff int check (max_staff is null or max_staff > 0);

comment on column plans.capabilities is
  'Entitlement keys unlocked by this plan: notifications, reminders, advanced_booking, booking_policies, staff_availability, analytics';
comment on column plans.max_staff is 'Active staff allowed on this plan; NULL means unlimited';

update plans set
  max_staff = 5,
  capabilities = '{}',
  features = '["Online booking","Public booking website","Services","Staff management (up to 5)","Calendar","Customer management","Business hours & availability","Booking confirmations","Basic booking settings"]'
where id = 'starter';

update plans set
  max_staff = null,
  capabilities = '{notifications,reminders,advanced_booking,booking_policies,staff_availability,analytics}',
  features = '["Everything in Starter","Unlimited staff","Booking notifications","Customer reminders","Advanced booking settings","Cancellation rules & rescheduling policy","Booking policies","Staff-specific availability","Buffer times","Minimum & maximum advance booking","Reports & analytics","Priority support"]'
where id = 'business';

-- The staff allowance for a business right now, mirroring business_has_capability():
--   no subscription row  -> unlimited (grandfathered)
--   trialing, not ended  -> unlimited (the trial shows the full product)
--   active, not expired  -> the plan's allowance
--   anything else        -> the smallest allowance any plan has
create or replace function business_staff_limit(p_business_id uuid) returns int
language plpgsql stable security definer set search_path = public as $$
declare
  v_sub subscriptions%rowtype;
begin
  select * into v_sub from subscriptions where business_id = p_business_id;
  if not found then return null; end if;

  if v_sub.status = 'trialing' and (v_sub.trial_end is null or v_sub.trial_end > now()) then
    return null;
  end if;

  if v_sub.status = 'active' and (v_sub.current_period_end is null or v_sub.current_period_end > now()) then
    return (select max_staff from plans where id = v_sub.plan_id);
  end if;

  return (select min(max_staff) from plans where max_staff is not null);
end $$;

revoke execute on function business_staff_limit from public, anon;
grant execute on function business_staff_limit to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Entitlement guards
-- ---------------------------------------------------------------------------

-- 2a. Staff allowance. Only *becoming* active counts: existing staff over the allowance after a
-- downgrade stay active and bookable, but no one new can be added or re-activated until the
-- business is back under it.
create or replace function guard_staff_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_limit int;
  v_active int;
begin
  if not new.is_active then return new; end if;
  if tg_op = 'UPDATE' and old.is_active then return new; end if;

  v_limit := business_staff_limit(new.business_id);
  if v_limit is null then return new; end if;

  -- Two tabs adding staff at once must not both squeeze under the limit.
  perform pg_advisory_xact_lock(hashtext('staff_limit:' || new.business_id::text));

  select count(*) into v_active from staff
   where business_id = new.business_id and is_active and id <> new.id;
  if v_active >= v_limit then
    raise exception 'Your plan includes up to % active staff members. Upgrade to Business for unlimited staff.', v_limit;
  end if;
  return new;
end $$;

drop trigger if exists staff_guard_limit on staff;
create trigger staff_guard_limit before insert or update of is_active on staff
  for each row execute function guard_staff_limit();

-- 2b. Advanced booking settings. Replaces 0021's guard: the timing rules join the list, and a
-- business without the plan may always put a setting back to its default — so a downgraded
-- account is never stuck with a custom rule it can no longer edit.
alter table business_settings
  add column if not exists reminders_enabled boolean not null default true,
  add column if not exists reminder_hours int not null default 24 check (reminder_hours between 1 and 72);

create or replace function guard_advanced_booking_settings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if ((new.buffer_minutes is distinct from old.buffer_minutes and new.buffer_minutes <> 0)
      or (new.allow_customer_cancellation is distinct from old.allow_customer_cancellation and not new.allow_customer_cancellation)
      or (new.cancellation_deadline_hours is distinct from old.cancellation_deadline_hours and new.cancellation_deadline_hours <> 2)
      or (new.slot_interval_minutes is distinct from old.slot_interval_minutes and new.slot_interval_minutes <> 30)
      or (new.min_notice_hours is distinct from old.min_notice_hours and new.min_notice_hours <> 2)
      or (new.max_advance_days is distinct from old.max_advance_days and new.max_advance_days <> 60))
     and not business_has_capability(new.business_id, 'advanced_booking') then
    raise exception 'Advanced booking settings are available on the Business plan';
  end if;

  if ((new.reminders_enabled is distinct from old.reminders_enabled and not new.reminders_enabled)
      or (new.reminder_hours is distinct from old.reminder_hours and new.reminder_hours <> 24))
     and not business_has_capability(new.business_id, 'reminders') then
    raise exception 'Customer reminders are available on the Business plan';
  end if;
  return new;
end $$;
-- The trigger itself (business_settings_guard_advanced) already exists from 0021.

-- 2c. Booking policies. Writing or changing a policy needs the plan; clearing one never does.
create or replace function guard_booking_policies() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if ((new.cancellation_policy is distinct from old.cancellation_policy and nullif(btrim(new.cancellation_policy), '') is not null)
      or (new.reschedule_policy is distinct from old.reschedule_policy and nullif(btrim(new.reschedule_policy), '') is not null)
      or (new.late_policy is distinct from old.late_policy and nullif(btrim(new.late_policy), '') is not null)
      or (new.no_show_policy is distinct from old.no_show_policy and nullif(btrim(new.no_show_policy), '') is not null))
     and not business_has_capability(new.id, 'booking_policies') then
    raise exception 'Booking policies are available on the Business plan';
  end if;
  return new;
end $$;

drop trigger if exists businesses_guard_policies on businesses;
create trigger businesses_guard_policies
  before update of cancellation_policy, reschedule_policy, late_policy, no_show_policy on businesses
  for each row execute function guard_booking_policies();

-- 2d. Staff-specific availability: weekly shifts and days off. Removing them is always allowed
-- (that is how a Starter business puts someone back on the business hours).
create or replace function guard_staff_availability() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_business uuid;
begin
  select business_id into v_business from staff where id = new.staff_id;
  if v_business is not null and not business_has_capability(v_business, 'staff_availability') then
    raise exception 'Staff schedules and days off are available on the Business plan';
  end if;
  return new;
end $$;

drop trigger if exists staff_schedules_guard on staff_schedules;
create trigger staff_schedules_guard before insert or update on staff_schedules
  for each row execute function guard_staff_availability();

drop trigger if exists staff_days_off_guard on staff_days_off;
create trigger staff_days_off_guard before insert or update on staff_days_off
  for each row execute function guard_staff_availability();

-- ---------------------------------------------------------------------------
-- 3. Slot engine: staff with no weekly schedule work the business hours
-- ---------------------------------------------------------------------------

-- Same as 0010, except the shift source. A staff member with schedule rows keeps exactly the
-- behaviour they had; one with none used to be unbookable and now follows the business hours.
-- create_booking() validates through this function, so it inherits the change.
create or replace function get_available_slots(p_service_id uuid, p_date date, p_staff_id uuid default null)
returns table (staff_id uuid, start_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_svc services%rowtype;
  v_set business_settings%rowtype;
  v_dow int;
  v_key text;
  v_dur interval;
  v_len interval;  -- duration + buffers: the range a booking blocks
  v_step interval;
begin
  select * into v_svc from services where id = p_service_id and is_active;
  if not found then return; end if;
  select * into v_set from business_settings where business_id = v_svc.business_id;
  if not found then return; end if;
  if not exists (select 1 from businesses where id = v_svc.business_id and is_active) then return; end if;

  if p_date = any(v_set.blocked_dates) then return; end if;
  if p_date > (now() at time zone v_set.timezone)::date + v_set.max_advance_days then return; end if;

  v_dow := extract(dow from p_date);
  v_key := (array['sun','mon','tue','wed','thu','fri','sat'])[v_dow + 1];
  v_dur := make_interval(mins => v_svc.duration_minutes);
  v_len := make_interval(mins => v_svc.duration_minutes + v_svc.buffer_minutes + v_set.buffer_minutes);
  v_step := make_interval(mins => v_set.slot_interval_minutes);

  return query
  select distinct sl.staff_id, sl.start_at
  from (
    select sh.staff_id, (g at time zone v_set.timezone) as start_at
    from (
      -- each shift intersected with business hours
      select w.staff_id, greatest(w.s, (h ->> 'start')::time) as s, least(w.e, (h ->> 'end')::time) as e
      from (
        select ss.staff_id, ss.start_time as s, ss.end_time as e
          from staff_schedules ss
         where ss.day_of_week = v_dow
        union all
        -- no schedule at all: the whole day, which the business hours then narrow down
        select st0.id, time '00:00', time '24:00'
          from staff st0
         where st0.business_id = v_svc.business_id
           and not exists (select 1 from staff_schedules x where x.staff_id = st0.id)
      ) w
      join staff st on st.id = w.staff_id and st.is_active and st.business_id = v_svc.business_id
      join staff_services sv on sv.staff_id = st.id and sv.service_id = p_service_id
      cross join jsonb_array_elements(coalesce(v_set.working_hours -> v_key, '[]'::jsonb)) h
      where (p_staff_id is null or w.staff_id = p_staff_id)
        and not exists (select 1 from staff_days_off d where d.staff_id = w.staff_id and d.date = p_date)
    ) sh,
    lateral generate_series(p_date + sh.s, p_date + sh.e - v_dur, v_step) g
  ) sl
  where sl.start_at >= now() + make_interval(hours => v_set.min_notice_hours)
    and not exists (
      select 1 from bookings b
      where b.staff_id = sl.staff_id
        and b.status in ('pending', 'confirmed')
        and tstzrange(b.start_at, b.end_at) && tstzrange(sl.start_at, sl.start_at + v_len)
    )
  order by sl.start_at, sl.staff_id;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Subscription lifecycle
-- ---------------------------------------------------------------------------

-- "Cancel" with prepaid, manually paid plans: nothing is ever charged automatically, so it means
-- "don't renew" — the plan runs to the end of the period, then ends as cancelled, not past due,
-- and the dashboard stops asking the owner to renew.
alter table subscriptions add column if not exists cancel_at_period_end boolean not null default false;

-- A new paid period (approval, admin change, plan switch) always supersedes a pending cancellation.
-- Only an *extension* counts: an end date moved earlier is not a new period.
create or replace function clear_cancellation_on_new_period() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.current_period_end > coalesce(old.current_period_end, '-infinity'::timestamptz) then
    new.cancel_at_period_end := false;
  end if;
  return new;
end $$;

drop trigger if exists subscriptions_clear_cancellation on subscriptions;
create trigger subscriptions_clear_cancellation before update on subscriptions
  for each row execute function clear_cancellation_on_new_period();

-- Same as 0018, but a cancelled-at-period-end plan ends as cancelled.
create or replace function expire_due_subscriptions() returns void
language sql security definer set search_path = public as $$
  update subscriptions
     set status = case when cancel_at_period_end then 'cancelled' else 'past_due' end
   where status = 'active' and current_period_end is not null and current_period_end < now()
$$;

-- Unused time on one plan, expressed as time on another at the two prices' ratio. Capped at a
-- year so a misconfigured price can never mint an open-ended subscription.
create or replace function convert_plan_credit(p_remaining interval, p_from_price int, p_to_price int) returns interval
language sql immutable as $$
  select least(
    greatest(p_remaining, interval '0') * (greatest(p_from_price, 0)::float8 / greatest(p_to_price, 1)::float8),
    interval '366 days'
  )
$$;

-- Approving a payment. Same as 0018, except switching plans mid-period no longer forfeits the
-- unused part of the old plan: it is converted at the price ratio and added to the new period.
create or replace function approve_subscription_payment(p_payment_id uuid) returns subscription_payments
language plpgsql security definer set search_path = public as $$
declare
  v_pay subscription_payments;
  v_plan plans;
  v_sub subscriptions;
  v_start timestamptz;
  v_end timestamptz;
  v_credit interval := interval '0';
  v_old_price int;
  v_has_sub boolean;
  v_live boolean;
  v_renewal boolean;
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
  if v_pay.amount_cents <> v_plan.price_cents or v_pay.currency <> v_plan.currency then
    raise exception 'The paid amount no longer matches the plan price. Reject this payment instead.';
  end if;
  if nullif(btrim(v_pay.customer_transaction_reference), '') is null or v_pay.proof_path is null then
    raise exception 'This payment is missing its reference or receipt';
  end if;

  select * into v_sub from subscriptions where business_id = v_pay.business_id for update;
  v_has_sub := found;
  v_live := v_has_sub and v_sub.status = 'active'
            and v_sub.current_period_end is not null and v_sub.current_period_end > now();

  v_renewal := v_live and v_sub.plan_id = v_plan.id;
  if v_renewal then
    -- Renewing the running plan: the new period starts where the current one ends.
    v_start := v_sub.current_period_end;
  else
    v_start := now();
    if v_live then
      select price_cents into v_old_price from plans where id = v_sub.plan_id;
      v_credit := convert_plan_credit(v_sub.current_period_end - now(), coalesce(v_old_price, 0), v_plan.price_cents);
    end if;
  end if;
  v_end := v_start + case v_plan.interval when 'year' then interval '1 year' else interval '1 month' end + v_credit;

  if v_has_sub then
    update subscriptions
       set plan_id = v_plan.id, status = 'active', provider = 'gotyme',
           -- A renewal keeps the period's real start; a new or switched plan starts now.
           current_period_start = case when v_renewal then coalesce(v_sub.current_period_start, now()) else now() end,
           current_period_end = v_end,
           cancel_at_period_end = false,
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
          jsonb_build_object('plan_id', v_plan.id, 'period_start', v_start, 'period_end', v_end,
                             'credit_seconds', extract(epoch from v_credit)));

  insert into notifications (business_id, type, title, message)
  values (v_pay.business_id, 'payment_approved', 'Payment verified',
          'Your payment has been verified and your ' || v_plan.name ||
          ' subscription is now active until ' || to_char(v_end at time zone 'Asia/Manila', 'Mon DD, YYYY') || '.');

  return v_pay;
end $$;

-- Switching to a cheaper plan. No payment is involved: the unused time on the current plan is
-- converted into (longer) time on the new one, so the owner never loses what they paid for.
-- Upgrades always go through a payment.
create or replace function change_plan_now(p_business_id uuid, p_plan_id text) returns subscriptions
language plpgsql security definer set search_path = public as $$
declare
  v_sub subscriptions;
  v_from plans;
  v_to plans;
  v_end timestamptz;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not is_business_admin(p_business_id) then
    raise exception 'You do not have permission to change this plan';
  end if;

  select * into v_sub from subscriptions where business_id = p_business_id for update;
  if not found or v_sub.status <> 'active'
     or v_sub.current_period_end is null or v_sub.current_period_end <= now() then
    raise exception 'You need an active paid plan to switch plans. Choose a plan to pay for instead.';
  end if;

  select * into v_to from plans where id = p_plan_id and is_active;
  if not found then raise exception 'That plan is no longer available'; end if;
  if v_to.id = v_sub.plan_id then raise exception 'You are already on this plan'; end if;
  select * into v_from from plans where id = v_sub.plan_id;
  if not found then raise exception 'Your current plan could not be found. Please contact support.'; end if;
  if v_to.price_cents >= v_from.price_cents then
    raise exception 'Upgrades are paid for from the Billing page';
  end if;

  if exists (select 1 from subscription_payments where business_id = p_business_id and status = 'pending') then
    raise exception 'Please wait until your pending payment has been verified before changing plans';
  end if;

  v_end := now() + convert_plan_credit(v_sub.current_period_end - now(), v_from.price_cents, v_to.price_cents);

  update subscriptions
     set plan_id = v_to.id, current_period_start = now(), current_period_end = v_end, cancel_at_period_end = false
   where id = v_sub.id
   returning * into v_sub;

  insert into payment_audit_log (business_id, actor_id, action, detail)
  values (p_business_id, auth.uid(), 'plan_downgraded',
          jsonb_build_object('from', v_from.id, 'to', v_to.id, 'ends_at', v_end));

  insert into notifications (business_id, type, title, message)
  values (p_business_id, 'plan_updated', 'Your plan was changed',
          'You are now on the ' || v_to.name || ' plan, active until ' ||
          to_char(v_end at time zone 'Asia/Manila', 'Mon DD, YYYY') || '.');

  return v_sub;
end $$;

revoke execute on function change_plan_now from public, anon;
grant execute on function change_plan_now to authenticated;

-- Cancel (don't renew) or resume a running paid plan.
create or replace function set_subscription_cancellation(p_business_id uuid, p_cancel boolean) returns subscriptions
language plpgsql security definer set search_path = public as $$
declare
  v_sub subscriptions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not is_business_admin(p_business_id) then
    raise exception 'You do not have permission to manage this subscription';
  end if;

  select * into v_sub from subscriptions where business_id = p_business_id for update;
  if not found or v_sub.status <> 'active'
     or v_sub.current_period_end is null or v_sub.current_period_end <= now() then
    raise exception 'There is no running plan to change. Choose a plan to start a new one.';
  end if;

  update subscriptions set cancel_at_period_end = coalesce(p_cancel, false)
   where id = v_sub.id
   returning * into v_sub;

  insert into payment_audit_log (business_id, actor_id, action, detail)
  values (p_business_id, auth.uid(),
          case when p_cancel then 'subscription_cancelled' else 'subscription_resumed' end,
          jsonb_build_object('plan_id', v_sub.plan_id, 'ends_at', v_sub.current_period_end));

  return v_sub;
end $$;

revoke execute on function set_subscription_cancellation from public, anon;
grant execute on function set_subscription_cancellation to authenticated;

revoke execute on function convert_plan_credit from public, anon;

-- ---------------------------------------------------------------------------
-- 5. Reports (analytics capability)
-- ---------------------------------------------------------------------------

-- One round trip for the Reports page. Revenue follows the dashboard's rule: completed bookings
-- at the service's price. The current period is compared with the one just before it.
create or replace function get_business_report(p_business_id uuid, p_days int)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text;
  v_to date;
  v_from date;
  v_prev date;
  v_result jsonb;
begin
  if not is_business_member(p_business_id) then
    raise exception 'You do not have permission to view these reports';
  end if;
  if not business_has_capability(p_business_id, 'analytics') then
    raise exception 'Reports are available on the Business plan';
  end if;
  if p_days not in (7, 30, 90, 365) then raise exception 'Unsupported report period'; end if;

  select timezone into v_tz from business_settings where business_id = p_business_id;
  v_tz := coalesce(v_tz, 'UTC');
  v_to := (now() at time zone v_tz)::date + 1;   -- exclusive: through today
  v_from := v_to - p_days;
  v_prev := v_from - p_days;

  with b as (
    select bk.id, bk.status, bk.customer_id, bk.staff_id, bk.service_id,
           (bk.start_at at time zone v_tz)::date as d,
           coalesce(s.price, 0)::numeric as price,
           s.name as service_name, st.name as staff_name
      from bookings bk
      left join services s on s.id = bk.service_id
      left join staff st on st.id = bk.staff_id
     where bk.business_id = p_business_id
       and bk.start_at >= (v_prev::timestamp at time zone v_tz)
       and bk.start_at < (v_to::timestamp at time zone v_tz)
  ),
  cur as (select * from b where d >= v_from),
  prev as (select * from b where d < v_from),
  first_visit as (
    select customer_id, min(start_at) as first_at
      from bookings
     where business_id = p_business_id and status <> 'cancelled'
     group by customer_id
  )
  select jsonb_build_object(
    'from', v_from,
    'to', v_to - 1,
    'days', p_days,
    'current', (
      select jsonb_build_object(
        'bookings', count(*) filter (where status <> 'cancelled'),
        'completed', count(*) filter (where status = 'completed'),
        'cancelled', count(*) filter (where status = 'cancelled'),
        'no_show', count(*) filter (where status = 'no_show'),
        'revenue', coalesce(sum(price) filter (where status = 'completed'), 0),
        'customers', count(distinct customer_id) filter (where status <> 'cancelled'),
        'new_customers', (
          select count(*) from first_visit fv
           where (fv.first_at at time zone v_tz)::date >= v_from
             and (fv.first_at at time zone v_tz)::date < v_to
        )
      ) from cur
    ),
    'previous', (
      select jsonb_build_object(
        'bookings', count(*) filter (where status <> 'cancelled'),
        'completed', count(*) filter (where status = 'completed'),
        'cancelled', count(*) filter (where status = 'cancelled'),
        'no_show', count(*) filter (where status = 'no_show'),
        'revenue', coalesce(sum(price) filter (where status = 'completed'), 0)
      ) from prev
    ),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object('date', g.d::date, 'bookings', coalesce(x.n, 0), 'revenue', coalesce(x.r, 0)) order by g.d), '[]')
        from generate_series(v_from, v_to - 1, interval '1 day') as g(d)
        left join (
          select d, count(*) filter (where status <> 'cancelled') as n,
                 sum(price) filter (where status = 'completed') as r
            from cur group by d
        ) x on x.d = g.d::date
    ),
    'services', (
      select coalesce(jsonb_agg(t order by t.bookings desc, t.name), '[]') from (
        select coalesce(service_name, 'Deleted service') as name,
               count(*) filter (where status <> 'cancelled') as bookings,
               coalesce(sum(price) filter (where status = 'completed'), 0) as revenue
          from cur group by service_id, service_name
         having count(*) filter (where status <> 'cancelled') > 0
         order by 2 desc limit 8
      ) t
    ),
    'staff', (
      select coalesce(jsonb_agg(t order by t.bookings desc, t.name), '[]') from (
        select coalesce(staff_name, 'Former staff') as name,
               count(*) filter (where status <> 'cancelled') as bookings,
               count(*) filter (where status = 'completed') as completed,
               count(*) filter (where status = 'no_show') as no_show,
               coalesce(sum(price) filter (where status = 'completed'), 0) as revenue
          from cur group by staff_id, staff_name
         having count(*) filter (where status <> 'cancelled') > 0
      ) t
    ),
    'weekdays', (
      select coalesce(jsonb_agg(jsonb_build_object('dow', w.dow, 'bookings', coalesce(x.n, 0)) order by w.dow), '[]')
        from generate_series(0, 6) as w(dow)
        left join (
          select extract(dow from d)::int as dow, count(*) as n
            from cur where status <> 'cancelled' group by 1
        ) x on x.dow = w.dow
    )
  ) into v_result;

  return v_result;
end $$;

revoke execute on function get_business_report from public, anon;
grant execute on function get_business_report to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Customer reminders (reminders capability)
-- ---------------------------------------------------------------------------

alter table bookings add column if not exists reminder_sent_at timestamptz;

-- Claims the reminders that are due, so concurrent runs can never email a customer twice.
-- A booking made inside the reminder window is skipped: its confirmation email is fresher.
-- Service role only — called by the booking-reminders Edge Function.
create or replace function claim_due_booking_reminders(p_limit int default 50) returns setof uuid
language plpgsql security definer set search_path = public as $$
begin
  return query
  with due as (
    select b.id
      from bookings b
      join business_settings s on s.business_id = b.business_id
      join customers c on c.id = b.customer_id
     where b.status = 'confirmed'
       and b.reminder_sent_at is null
       and s.reminders_enabled
       and b.start_at > now()
       and b.start_at <= now() + make_interval(hours => s.reminder_hours)
       and b.created_at <= b.start_at - make_interval(hours => s.reminder_hours)
       and c.email is not null
       and business_has_capability(b.business_id, 'reminders')
     order by b.start_at
     limit greatest(1, least(coalesce(p_limit, 50), 200))
       for update of b skip locked
  )
  update bookings bk set reminder_sent_at = now()
    from due where bk.id = due.id
  returning bk.id;
end $$;

revoke execute on function claim_due_booking_reminders from public, anon, authenticated;
grant execute on function claim_due_booking_reminders to service_role;

-- ---------------------------------------------------------------------------
-- 7. Schedules and realtime
-- ---------------------------------------------------------------------------

-- Reminders every 15 minutes; lapsed subscriptions flipped hourly (the UI and the guards already
-- treat a passed end date as expired, this keeps the stored status honest too). Skipped with a
-- notice where pg_cron is unavailable, e.g. some local setups.
do $sched$
begin
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.unschedule(jobid) from cron.job
   where jobname in ('appointly-booking-reminders', 'appointly-expire-subscriptions');
  perform cron.schedule(
    'appointly-booking-reminders', '*/15 * * * *',
    $job$ select net.http_post(
      url := 'https://wmvvkeptnaaasuhjcgkk.supabase.co/functions/v1/booking-reminders',
      body := '{}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb
    ) $job$
  );
  perform cron.schedule('appointly-expire-subscriptions', '5 * * * *', $job$ select public.expire_due_subscriptions() $job$);
exception when others then
  raise notice 'pg_cron scheduling skipped (%). Schedule booking-reminders and expire_due_subscriptions manually.', sqlerrm;
end $sched$;

-- The dashboard listens for its own subscription row (RLS still applies to realtime).
do $rt$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'subscriptions') then
    alter publication supabase_realtime add table subscriptions;
  end if;
end $rt$;
