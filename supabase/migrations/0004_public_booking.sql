-- Lets a customer view their booking by its secret token (no account, no direct table access).
create function get_booking(p_token uuid)
returns table (
  status booking_status, start_at timestamptz, end_at timestamptz,
  service_name text, staff_name text, customer_name text,
  business_name text, business_phone text, business_address text, timezone text
)
language sql stable security definer set search_path = public as $$
  select b.status, b.start_at, b.start_at + make_interval(mins => s.duration_minutes),
         s.name, st.name, c.name, bu.name, bu.phone, bu.address, bs.timezone
  from bookings b
  join services s on s.id = b.service_id
  join staff st on st.id = b.staff_id
  join customers c on c.id = b.customer_id
  join businesses bu on bu.id = b.business_id
  join business_settings bs on bs.business_id = b.business_id
  where b.public_token = p_token
$$;

revoke execute on function get_booking from public;
grant execute on function get_booking to anon, authenticated;
