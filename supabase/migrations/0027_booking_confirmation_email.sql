-- Booking confirmation emails: when a booking becomes 'confirmed' (auto-confirm on insert, or
-- the owner approving a pending one) the database asks the booking-confirmed-email Edge
-- Function to email the customer. Doing it here rather than in the frontend means every path
-- that confirms a booking sends the email, and the Resend key never leaves the server.

create extension if not exists pg_net with schema extensions;

-- Set by the Edge Function when it claims a booking, so each booking is emailed at most once.
alter table bookings add column if not exists confirmation_email_sent_at timestamptz;

create or replace function request_booking_confirmation_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- The function only needs the id: it re-reads the booking and checks it is still confirmed
  -- and not yet emailed, so a stray or replayed call can never send a wrong or duplicate email.
  perform net.http_post(
    url := 'https://wmvvkeptnaaasuhjcgkk.supabase.co/functions/v1/booking-confirmed-email',
    body := jsonb_build_object('booking_id', new.id),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
end $$;

drop trigger if exists bookings_confirmation_email_on_insert on bookings;
create trigger bookings_confirmation_email_on_insert after insert on bookings
  for each row when (new.status = 'confirmed')
  execute function request_booking_confirmation_email();

-- "update of status" so the function's own write to confirmation_email_sent_at doesn't re-fire it.
drop trigger if exists bookings_confirmation_email_on_update on bookings;
create trigger bookings_confirmation_email_on_update after update of status on bookings
  for each row when (new.status = 'confirmed' and old.status is distinct from 'confirmed')
  execute function request_booking_confirmation_email();
