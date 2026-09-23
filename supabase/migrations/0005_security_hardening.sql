-- Security review fixes

-- 1. Staff email/phone were readable by anyone with the anon key. Expose only public columns.
revoke select on staff from anon;
grant select (id, business_id, name, avatar_url, is_active) on staff to anon;

-- 2. Defense in depth: anon has no business touching private tables (RLS already denies it).
revoke all on bookings, customers, staff_schedules, staff_days_off, business_members, profiles from anon;

-- 3. Anonymous (public-page) bookings: at most 5 upcoming active bookings per customer.
--    Signed-in business members are exempt. NOTE: also applies to inserts from the SQL editor.
create function limit_public_bookings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null and (
    select count(*) from bookings
    where customer_id = new.customer_id and status in ('pending', 'confirmed') and end_at > now()
  ) >= 5 then
    raise exception 'Too many upcoming bookings. Please contact the business directly.';
  end if;
  return new;
end $$;
create trigger bookings_public_limit before insert on bookings
  for each row execute function limit_public_bookings();

-- 4. Cap businesses per user so create_business can't be used to squat slugs in bulk.
create or replace function create_business(p_name text, p_slug text, p_category text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare bid uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if (select count(*) from business_members where user_id = auth.uid() and role = 'owner') >= 3 then
    raise exception 'Business limit reached';
  end if;
  insert into businesses (name, slug, category) values (p_name, p_slug, p_category) returning id into bid;
  insert into business_members (business_id, user_id, role) values (bid, auth.uid(), 'owner');
  insert into business_settings (business_id) values (bid);
  return bid;
end $$;
