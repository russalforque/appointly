-- Booking settings: business-wide buffer between appointments + customer self-cancellation.
-- min_notice_hours, max_advance_days, and auto_confirm already exist on business_settings (0001).

alter table business_settings
  add column buffer_minutes int not null default 0 check (buffer_minutes between 0 and 120),
  add column allow_customer_cancellation boolean not null default true,
  add column cancellation_deadline_hours int not null default 2 check (cancellation_deadline_hours >= 0);

-- Re-create get_available_slots so the business-wide buffer (on top of the service's own buffer)
-- is honored, same as 0003 with v_len also adding v_set.buffer_minutes.
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
      -- staff shift intersected with business hours
      select ss.staff_id, greatest(ss.start_time, (h ->> 'start')::time) as s,
             least(ss.end_time, (h ->> 'end')::time) as e
      from staff_schedules ss
      join staff st on st.id = ss.staff_id and st.is_active and st.business_id = v_svc.business_id
      join staff_services sv on sv.staff_id = st.id and sv.service_id = p_service_id
      cross join jsonb_array_elements(coalesce(v_set.working_hours -> v_key, '[]'::jsonb)) h
      where ss.day_of_week = v_dow
        and (p_staff_id is null or ss.staff_id = p_staff_id)
        and not exists (select 1 from staff_days_off d where d.staff_id = ss.staff_id and d.date = p_date)
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

-- Re-create create_booking so a booking's stored end_at also reserves the business-wide buffer,
-- keeping it consistent with get_available_slots (each booking "owns" its own trailing buffer).
create or replace function create_booking(
  p_service_id uuid, p_start timestamptz, p_name text, p_email text, p_phone text,
  p_notes text default null, p_staff_id uuid default null
) returns table (booking_id uuid, public_token uuid)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_svc services%rowtype;
  v_set business_settings%rowtype;
  v_staff uuid;
  v_cust uuid;
  v_id uuid;
  v_tok uuid;
begin
  p_name := btrim(coalesce(p_name, ''));
  p_email := nullif(btrim(coalesce(p_email, '')), '');
  p_phone := nullif(btrim(coalesce(p_phone, '')), '');
  if p_name = '' or length(p_name) > 100 then raise exception 'Please enter a valid name'; end if;
  if p_email is null and p_phone is null then raise exception 'Email or phone is required'; end if;
  if p_email is not null and p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Invalid email'; end if;
  if length(coalesce(p_notes, '')) > 500 or length(coalesce(p_phone, '')) > 30 then raise exception 'Input too long'; end if;

  select * into v_svc from services where id = p_service_id and is_active;
  if not found then raise exception 'Service not found'; end if;
  select * into v_set from business_settings where business_id = v_svc.business_id;

  select a.staff_id into v_staff
  from get_available_slots(p_service_id, (p_start at time zone v_set.timezone)::date, p_staff_id) a
  where a.start_at = p_start limit 1;
  if v_staff is null then raise exception 'Time slot is no longer available'; end if;

  -- reuse an existing customer without letting the public overwrite their data
  select c.id into v_cust from customers c
  where c.business_id = v_svc.business_id
    and ((p_email is not null and lower(c.email) = lower(p_email)) or (p_email is null and c.phone = p_phone))
  limit 1;
  if v_cust is null then
    insert into customers (business_id, name, email, phone) values (v_svc.business_id, p_name, p_email, p_phone)
    returning id into v_cust;
  end if;

  begin
    insert into bookings (business_id, service_id, staff_id, customer_id, start_at, end_at, status, notes)
    values (
      v_svc.business_id, p_service_id, v_staff, v_cust, p_start,
      p_start + make_interval(mins => v_svc.duration_minutes + v_svc.buffer_minutes + v_set.buffer_minutes),
      case when v_set.auto_confirm then 'confirmed'::booking_status else 'pending'::booking_status end,
      nullif(btrim(coalesce(p_notes, '')), '')
    ) returning bookings.id, bookings.public_token into v_id, v_tok;
  exception when exclusion_violation then
    raise exception 'Time slot is no longer available';
  end;

  return query select v_id, v_tok;
end $$;

-- get_booking now also reports whether/until-when the customer can self-cancel.
drop function get_booking(uuid);
create function get_booking(p_token uuid)
returns table (
  status booking_status, start_at timestamptz, end_at timestamptz,
  service_name text, staff_name text, customer_name text,
  business_name text, business_slug text, business_phone text, business_address text, timezone text,
  can_cancel boolean
)
language sql stable security definer set search_path = public as $$
  select b.status, b.start_at, b.start_at + make_interval(mins => s.duration_minutes),
         s.name, st.name, c.name, bu.name, bu.slug, bu.phone, bu.address, bs.timezone,
         bs.allow_customer_cancellation
           and b.status in ('pending', 'confirmed')
           and now() <= b.start_at - make_interval(hours => bs.cancellation_deadline_hours)
  from bookings b
  join services s on s.id = b.service_id
  join staff st on st.id = b.staff_id
  join customers c on c.id = b.customer_id
  join businesses bu on bu.id = b.business_id
  join business_settings bs on bs.business_id = b.business_id
  where b.public_token = p_token
$$;

-- Lets a customer cancel their own booking (by secret token) up to the configured deadline.
create function cancel_booking(p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_booking bookings%rowtype;
  v_set business_settings%rowtype;
begin
  select * into v_booking from bookings where public_token = p_token;
  if not found then raise exception 'Booking not found'; end if;
  select * into v_set from business_settings where business_id = v_booking.business_id;

  if v_booking.status not in ('pending', 'confirmed') then
    raise exception 'This booking can no longer be cancelled';
  end if;
  if not v_set.allow_customer_cancellation then
    raise exception 'Online cancellation is not available for this business';
  end if;
  if now() > v_booking.start_at - make_interval(hours => v_set.cancellation_deadline_hours) then
    raise exception 'Too late to cancel online. Please contact the business directly.';
  end if;

  update bookings set status = 'cancelled' where id = v_booking.id;
end $$;

revoke execute on function get_booking, cancel_booking from public;
grant execute on function get_booking, cancel_booking to anon, authenticated;
