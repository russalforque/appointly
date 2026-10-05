-- Business Profile: richer public identity, per-field contact visibility, uploaded branding, and
-- customer-facing booking copy.
--
-- Hours, time zone, slot interval, notice and advance window are NOT added here: they already live
-- on business_settings and are edited from Business Hours / Booking Settings. The profile page only
-- summarizes them.
--
-- Backward compatible: every new column is nullable or defaults to today's behaviour (contact
-- details stay visible), and no existing value is rewritten.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

alter table businesses
  add column if not exists tagline text,
  add column if not exists website_url text,
  add column if not exists city text,
  add column if not exists region text,
  add column if not exists postal_code text,
  add column if not exists maps_url text,
  add column if not exists facebook_url text,
  add column if not exists instagram_url text,
  add column if not exists tiktok_url text,
  add column if not exists show_phone boolean not null default true,
  add column if not exists show_email boolean not null default true,
  add column if not exists show_address boolean not null default true,
  add column if not exists booking_instructions text,
  add column if not exists confirmation_message text,
  add column if not exists cancellation_policy text,
  add column if not exists reschedule_policy text,
  add column if not exists late_policy text,
  add column if not exists no_show_policy text;

-- Same rules as 0026: PostgREST writes skip the form, so the database holds the limits, and every
-- link that renders on a public page must be http(s).
alter table businesses
  drop constraint if exists businesses_tagline_len,
  drop constraint if exists businesses_city_len,
  drop constraint if exists businesses_region_len,
  drop constraint if exists businesses_postal_code_len,
  drop constraint if exists businesses_website_url_web,
  drop constraint if exists businesses_maps_url_web,
  drop constraint if exists businesses_facebook_url_web,
  drop constraint if exists businesses_instagram_url_web,
  drop constraint if exists businesses_tiktok_url_web,
  drop constraint if exists businesses_booking_instructions_len,
  drop constraint if exists businesses_confirmation_message_len,
  drop constraint if exists businesses_cancellation_policy_len,
  drop constraint if exists businesses_reschedule_policy_len,
  drop constraint if exists businesses_late_policy_len,
  drop constraint if exists businesses_no_show_policy_len,
  add constraint businesses_tagline_len check (length(tagline) <= 120),
  add constraint businesses_city_len check (length(city) <= 120),
  add constraint businesses_region_len check (length(region) <= 120),
  add constraint businesses_postal_code_len check (length(postal_code) <= 20),
  add constraint businesses_website_url_web check (is_web_url(website_url)),
  add constraint businesses_maps_url_web check (is_web_url(maps_url)),
  add constraint businesses_facebook_url_web check (is_web_url(facebook_url)),
  add constraint businesses_instagram_url_web check (is_web_url(instagram_url)),
  add constraint businesses_tiktok_url_web check (is_web_url(tiktok_url)),
  add constraint businesses_booking_instructions_len check (length(booking_instructions) <= 500),
  add constraint businesses_confirmation_message_len check (length(confirmation_message) <= 500),
  add constraint businesses_cancellation_policy_len check (length(cancellation_policy) <= 1000),
  add constraint businesses_reschedule_policy_len check (length(reschedule_policy) <= 1000),
  add constraint businesses_late_policy_len check (length(late_policy) <= 1000),
  add constraint businesses_no_show_policy_len check (length(no_show_policy) <= 1000);

-- ---------------------------------------------------------------------------
-- 2. Public reads go through a function that applies the visibility switches
-- ---------------------------------------------------------------------------

-- businesses_public_read (0002) let anyone `select *` an active business, so a "hide my phone"
-- switch would only have hidden it from the page, not from the API. Direct reads become
-- members-only; every server-side reader (booking engine, admin RPCs, get_booking) is already
-- security definer and is unaffected.
drop policy if exists businesses_public_read on businesses;
drop policy if exists businesses_member_read on businesses;
create policy businesses_member_read on businesses for select to authenticated
  using (is_business_member(id));
revoke select on businesses from anon;

-- Everything the public booking page needs in one call. A hidden business (is_active = false)
-- is returned only to its own members, so owners can still preview it.
create or replace function get_public_business(p_slug text)
returns table (
  id uuid, slug text, name text, category text, tagline text, description text, about text,
  logo_url text, cover_image_url text, accent_color text, is_active boolean,
  phone text, email text, address text, city text, region text, postal_code text, maps_url text,
  website_url text, facebook_url text, instagram_url text, tiktok_url text,
  booking_instructions text, cancellation_policy text, reschedule_policy text,
  late_policy text, no_show_policy text,
  timezone text, max_advance_days int, working_hours jsonb
)
language sql stable security definer set search_path = public as $$
  select b.id, b.slug, b.name, b.category, b.tagline, b.description, b.about,
         b.logo_url, b.cover_image_url, b.accent_color, b.is_active,
         case when b.show_phone then b.phone end,
         case when b.show_email then b.email end,
         case when b.show_address then b.address end,
         case when b.show_address then b.city end,
         case when b.show_address then b.region end,
         case when b.show_address then b.postal_code end,
         case when b.show_address then b.maps_url end,
         b.website_url, b.facebook_url, b.instagram_url, b.tiktok_url,
         b.booking_instructions, b.cancellation_policy, b.reschedule_policy,
         b.late_policy, b.no_show_policy,
         s.timezone, s.max_advance_days, s.working_hours
    from businesses b
    join business_settings s on s.business_id = b.id
   where b.slug = p_slug
     and (b.is_active or is_business_member(b.id))
$$;
revoke execute on function get_public_business from public;
grant execute on function get_public_business to anon, authenticated;

-- Slug availability for the setup and profile forms. Members can no longer see other businesses'
-- rows, so a plain select would always answer "free"; this reports existence only, never the row.
create or replace function is_slug_available(p_slug text)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     and length(p_slug) between 3 and 63
     and not exists (select 1 from businesses where slug = p_slug and not is_business_member(id))
$$;
revoke execute on function is_slug_available from public;
grant execute on function is_slug_available to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Confirmation page: same visibility rules, plus the business's own copy
-- ---------------------------------------------------------------------------

drop function get_booking(uuid);
create or replace function get_booking(p_token uuid)
returns table (
  status booking_status, start_at timestamptz, end_at timestamptz,
  service_name text, staff_name text, customer_name text,
  business_name text, business_slug text, business_phone text, business_address text, timezone text,
  can_cancel boolean, business_logo_url text, business_accent_color text,
  business_maps_url text, booking_instructions text, confirmation_message text, cancellation_policy text
)
language sql stable security definer set search_path = public as $$
  select b.status, b.start_at, b.start_at + make_interval(mins => s.duration_minutes),
         s.name, st.name, c.name, bu.name, bu.slug,
         case when bu.show_phone then bu.phone end,
         case when bu.show_address
              then nullif(concat_ws(', ', nullif(bu.address, ''), nullif(bu.city, ''),
                                    nullif(bu.region, ''), nullif(bu.postal_code, '')), '') end,
         bs.timezone,
         bs.allow_customer_cancellation
           and b.status in ('pending', 'confirmed')
           and now() <= b.start_at - make_interval(hours => bs.cancellation_deadline_hours),
         bu.logo_url, bu.accent_color,
         case when bu.show_address then bu.maps_url end,
         bu.booking_instructions, bu.confirmation_message, bu.cancellation_policy
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

-- ---------------------------------------------------------------------------
-- 4. Storage: uploaded logo and cover image
-- ---------------------------------------------------------------------------

-- Public (the images render on the public booking page), raster only (an SVG can carry script),
-- 5 MB. Path convention, as for service-images: <business_id>/<file>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-branding', 'business-branding', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists business_branding_public_read on storage.objects;
create policy business_branding_public_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'business-branding');

drop policy if exists business_branding_admin_insert on storage.objects;
create policy business_branding_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'business-branding' and is_business_admin_folder((storage.foldername(name))[1]));

drop policy if exists business_branding_admin_update on storage.objects;
create policy business_branding_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'business-branding' and is_business_admin_folder((storage.foldername(name))[1]))
  with check (bucket_id = 'business-branding' and is_business_admin_folder((storage.foldername(name))[1]));

drop policy if exists business_branding_admin_delete on storage.objects;
create policy business_branding_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'business-branding' and is_business_admin_folder((storage.foldername(name))[1]));
