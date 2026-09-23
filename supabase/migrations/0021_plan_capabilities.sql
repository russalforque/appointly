-- Makes the Starter and Business plans actually differ.
--
-- Until now plan_id only drove the price and the label: a Starter subscriber received booking
-- notifications and the full booking-settings page, which are exactly the two things the Business
-- plan is sold on. This migration turns those into real, server-enforced entitlements.
--
-- Enforcement lives in the database (a trigger and a gate inside the notification trigger), so
-- hiding the controls in the UI is a courtesy rather than the actual paywall.

-- What each plan unlocks. Empty for Starter: it keeps everything that is not listed here.
alter table plans add column capabilities text[] not null default '{}';

update plans set capabilities = '{}' where id = 'starter';
update plans set capabilities = '{notifications,advanced_booking}' where id = 'business';

comment on column plans.capabilities is
  'Entitlement keys unlocked by this plan: notifications, advanced_booking';

-- Does this business's live subscription include a capability?
--
--   no subscription row  -> true  (grandfathered, same as hasBillingAccess)
--   trialing, not ended  -> true  (the trial shows the full product)
--   active, not expired  -> whatever the plan grants
--   anything else        -> false
create function business_has_capability(p_business_id uuid, p_capability text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_sub subscriptions%rowtype;
  v_caps text[];
begin
  select * into v_sub from subscriptions where business_id = p_business_id;
  if not found then return true; end if;

  if v_sub.status = 'trialing' then
    return v_sub.trial_end is null or v_sub.trial_end > now();
  end if;

  if v_sub.status = 'active' and (v_sub.current_period_end is null or v_sub.current_period_end > now()) then
    select capabilities into v_caps from plans where id = v_sub.plan_id;
    return p_capability = any(coalesce(v_caps, '{}'));
  end if;

  return false;
end $$;

revoke execute on function business_has_capability from public, anon;
grant execute on function business_has_capability to authenticated;

-- ---------------------------------------------------------------------------
-- Booking notifications (Business plan)
-- ---------------------------------------------------------------------------

-- Same as 0009, but a business without the entitlement simply gets no booking notification.
-- Billing notifications (payment_submitted / approved / rejected) are written directly by the
-- payment RPCs and are deliberately NOT gated — every customer must hear about their own money.
create or replace function notify_new_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cust text;
  v_svc text;
begin
  if not business_has_capability(new.business_id, 'notifications') then
    return new;
  end if;
  select name into v_cust from customers where id = new.customer_id;
  select name into v_svc from services where id = new.service_id;
  insert into notifications (business_id, booking_id, type, title, message)
  values (
    new.business_id, new.id, 'new_booking', 'New booking',
    coalesce(v_cust, 'A customer') || ' booked ' || coalesce(v_svc, 'a service')
  );
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Advanced booking settings (Business plan)
-- ---------------------------------------------------------------------------

-- Starter keeps the core scheduling controls (minimum notice, maximum advance, auto-confirm)
-- and the hours/timezone/blocked-dates it shares with the Business Hours page. The columns
-- below are the ones the pricing page calls "advanced booking settings".
create function guard_advanced_booking_settings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.buffer_minutes is distinct from old.buffer_minutes
      or new.allow_customer_cancellation is distinct from old.allow_customer_cancellation
      or new.cancellation_deadline_hours is distinct from old.cancellation_deadline_hours
      or new.slot_interval_minutes is distinct from old.slot_interval_minutes)
     and not business_has_capability(new.business_id, 'advanced_booking') then
    raise exception 'Advanced booking settings are available on the Business plan';
  end if;
  return new;
end $$;

create trigger business_settings_guard_advanced before update on business_settings
  for each row execute function guard_advanced_booking_settings();
