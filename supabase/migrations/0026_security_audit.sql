-- Security audit fixes. Each section names the hole it closes; none of them changes what the app
-- itself does, apart from the public booking page reading staff through get_public_staff().

-- ---------------------------------------------------------------------------
-- 1. Staff contact details: every signed-in account could read every business's staff
-- ---------------------------------------------------------------------------

-- 0005 limited anon to the public staff columns, but staff_read (0002) also lets *authenticated*
-- read every active staff row of every business with all columns, and signing up is free. So any
-- account could do `supabase.from('staff').select('email, phone')` and collect the contact details
-- of every business's staff. (The anon column grant also never gained `position` from 0015, so the
-- booking page's staff query failed for signed-out visitors.)
--
-- The public booking page now reads staff through this function, which returns only the columns a
-- customer needs. The table itself becomes members-only.
create or replace function get_public_staff(p_business_id uuid)
returns table (id uuid, business_id uuid, name text, avatar_url text, "position" text, is_active boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.business_id, s.name, s.avatar_url, s.position, s.is_active
    from staff s
    join businesses b on b.id = s.business_id
   where s.business_id = p_business_id
     and s.is_active
     and (b.is_active or is_business_member(b.id))
   order by s.name
$$;
revoke execute on function get_public_staff from public;
grant execute on function get_public_staff to anon, authenticated;

drop policy if exists staff_read on staff;
create policy staff_read on staff for select to authenticated
  using (is_business_member(business_id));
-- Also drops 0005's column grants: anon never reads the table directly any more.
revoke select on staff from anon;

-- ---------------------------------------------------------------------------
-- 2. Public booking limit: any signed-in account skipped it
-- ---------------------------------------------------------------------------

-- 0005 exempted callers with `auth.uid() is not null`, intending "the business's own staff". But
-- any account counts, so an attacker only had to sign up to book a business's calendar full under
-- one customer. Only the business's own members are exempt now.
create or replace function limit_public_bookings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_business_member(new.business_id) and (
    select count(*) from bookings
    where customer_id = new.customer_id and status in ('pending', 'confirmed') and end_at > now()
  ) >= 5 then
    raise exception 'Too many upcoming bookings. Please contact the business directly.';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 3. business_settings: the advanced-settings paywall could be sidestepped
-- ---------------------------------------------------------------------------

-- settings_write was `for all`, and the Business-plan guard (0021) is an UPDATE trigger. A Starter
-- admin could therefore DELETE the row and INSERT a new one carrying buffer/cancellation values the
-- plan does not include. The row is created by create_business() and the app only ever updates it.
drop policy if exists settings_write on business_settings;
drop policy if exists settings_update on business_settings;
create policy settings_update on business_settings for update to authenticated
  using (is_business_admin(business_id)) with check (is_business_admin(business_id));

-- ---------------------------------------------------------------------------
-- 4. Size and scheme limits on free-text and URL columns
-- ---------------------------------------------------------------------------

-- PostgREST writes go straight to these tables, so the form's maxLength is not a limit. The values
-- sit well above what the forms allow, so no legitimate edit is refused. URL columns render as
-- <img src> on public pages; only http(s) is accepted so javascript:/data: values cannot be stored.
--
-- NOT VALID: enforced on every insert and update from now on, without failing the migration over
-- an existing row.
create or replace function is_web_url(p text) returns boolean language sql immutable as $$
  select p is null or (p ~* '^https?://\S+$' and length(p) <= 2048)
$$;

alter table businesses
  drop constraint if exists businesses_name_len,
  drop constraint if exists businesses_slug_len,
  drop constraint if exists businesses_category_len,
  drop constraint if exists businesses_description_len,
  drop constraint if exists businesses_about_len,
  drop constraint if exists businesses_phone_len,
  drop constraint if exists businesses_email_len,
  drop constraint if exists businesses_address_len,
  drop constraint if exists businesses_logo_url_web,
  drop constraint if exists businesses_cover_url_web,
  add constraint businesses_name_len check (length(name) between 1 and 120) not valid,
  add constraint businesses_slug_len check (length(slug) <= 63) not valid,
  add constraint businesses_category_len check (length(category) <= 80) not valid,
  add constraint businesses_description_len check (length(description) <= 1000) not valid,
  add constraint businesses_about_len check (length(about) <= 5000) not valid,
  add constraint businesses_phone_len check (length(phone) <= 40) not valid,
  add constraint businesses_email_len check (length(email) <= 254) not valid,
  add constraint businesses_address_len check (length(address) <= 500) not valid,
  add constraint businesses_logo_url_web check (is_web_url(logo_url)) not valid,
  add constraint businesses_cover_url_web check (is_web_url(cover_image_url)) not valid;

alter table services
  drop constraint if exists services_name_len,
  drop constraint if exists services_description_len,
  drop constraint if exists services_duration_max,
  drop constraint if exists services_buffer_max,
  drop constraint if exists services_image_url_web,
  add constraint services_name_len check (length(name) between 1 and 200) not valid,
  add constraint services_description_len check (length(description) <= 2000) not valid,
  add constraint services_duration_max check (duration_minutes <= 1440) not valid,
  add constraint services_buffer_max check (buffer_minutes <= 480) not valid,
  add constraint services_image_url_web check (is_web_url(image_url)) not valid;

alter table staff
  drop constraint if exists staff_name_len,
  drop constraint if exists staff_email_len,
  drop constraint if exists staff_phone_len,
  drop constraint if exists staff_position_len,
  drop constraint if exists staff_avatar_url_web,
  add constraint staff_name_len check (length(name) between 1 and 120) not valid,
  add constraint staff_email_len check (length(email) <= 254) not valid,
  add constraint staff_phone_len check (length(phone) <= 40) not valid,
  add constraint staff_position_len check (length(position) <= 120) not valid,
  add constraint staff_avatar_url_web check (is_web_url(avatar_url)) not valid;

alter table staff_days_off
  drop constraint if exists staff_days_off_reason_len,
  add constraint staff_days_off_reason_len check (length(reason) <= 500) not valid;

alter table customers
  drop constraint if exists customers_name_len,
  drop constraint if exists customers_email_len,
  drop constraint if exists customers_phone_len,
  drop constraint if exists customers_notes_len,
  add constraint customers_name_len check (length(name) between 1 and 200) not valid,
  add constraint customers_email_len check (length(email) <= 254) not valid,
  add constraint customers_phone_len check (length(phone) <= 40) not valid,
  add constraint customers_notes_len check (length(notes) <= 5000) not valid;

alter table bookings
  drop constraint if exists bookings_notes_len,
  add constraint bookings_notes_len check (length(notes) <= 2000) not valid;

alter table profiles
  drop constraint if exists profiles_full_name_len,
  drop constraint if exists profiles_avatar_url_web,
  add constraint profiles_full_name_len check (length(full_name) <= 200) not valid,
  add constraint profiles_avatar_url_web check (is_web_url(avatar_url)) not valid;

-- Written only through the payment RPCs, which never bounded these.
alter table subscription_payments
  drop constraint if exists subscription_payments_notes_len,
  drop constraint if exists subscription_payments_rejection_len,
  add constraint subscription_payments_notes_len check (length(notes) <= 1000) not valid,
  add constraint subscription_payments_rejection_len check (length(rejection_reason) <= 1000) not valid;

alter table payment_settings
  drop constraint if exists payment_settings_account_name_len,
  drop constraint if exists payment_settings_account_number_len,
  drop constraint if exists payment_settings_instructions_len,
  drop constraint if exists payment_settings_qr_url_web,
  add constraint payment_settings_account_name_len check (length(account_name) <= 200) not valid,
  add constraint payment_settings_account_number_len check (length(account_number) <= 64) not valid,
  add constraint payment_settings_instructions_len check (length(instructions) <= 4000) not valid,
  add constraint payment_settings_qr_url_web check (is_web_url(qr_image_url)) not valid;

-- ---------------------------------------------------------------------------
-- 5. payment-assets: no SVG
-- ---------------------------------------------------------------------------

-- An SVG can carry script, and this bucket is public. The admin UI only uploads JPG/PNG/WebP.
update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'payment-assets';
