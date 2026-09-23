-- Let the public booking-confirmation page carry the business's own branding.
drop function get_booking(uuid);
create function get_booking(p_token uuid)
returns table (
  status booking_status, start_at timestamptz, end_at timestamptz,
  service_name text, staff_name text, customer_name text,
  business_name text, business_slug text, business_phone text, business_address text, timezone text,
  can_cancel boolean, business_logo_url text, business_accent_color text
)
language sql stable security definer set search_path = public as $$
  select b.status, b.start_at, b.start_at + make_interval(mins => s.duration_minutes),
         s.name, st.name, c.name, bu.name, bu.slug, bu.phone, bu.address, bs.timezone,
         bs.allow_customer_cancellation
           and b.status in ('pending', 'confirmed')
           and now() <= b.start_at - make_interval(hours => bs.cancellation_deadline_hours),
         bu.logo_url, bu.accent_color
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
