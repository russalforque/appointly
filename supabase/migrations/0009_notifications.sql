-- Booking notifications: in-app "new booking" alerts + reminder-ready tracking on bookings.

alter table bookings
  add column reminder_status text not null default 'pending'
    check (reminder_status in ('pending', 'sent', 'failed'));

create table notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  booking_id uuid references bookings(id) on delete cascade,
  type text not null default 'new_booking',
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index on notifications (business_id, is_read, created_at desc);

alter table notifications enable row level security;

create policy notifications_select on notifications for select to authenticated
  using (is_business_member(business_id));
-- Only is_read may be toggled by a business member (marking as read).
create policy notifications_update on notifications for update to authenticated
  using (is_business_member(business_id)) with check (is_business_member(business_id));

-- Creates the "new booking" notification for the business. Runs as security definer so it
-- also fires for anonymous public bookings, which never have table access of their own.
create function notify_new_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cust text;
  v_svc text;
begin
  select name into v_cust from customers where id = new.customer_id;
  select name into v_svc from services where id = new.service_id;
  insert into notifications (business_id, booking_id, type, title, message)
  values (
    new.business_id, new.id, 'new_booking', 'New booking',
    coalesce(v_cust, 'A customer') || ' booked ' || coalesce(v_svc, 'a service')
  );
  return new;
end $$;

create trigger bookings_notify_new after insert on bookings
  for each row execute function notify_new_booking();
