-- Production hardening. No behaviour changes for anything the app already does; this closes
-- write paths RLS left open, stops two storage policies from erroring on a malformed path, and
-- adds the one index the customer queries were missing.

-- ---------------------------------------------------------------------------
-- 1. profiles: privilege escalation
-- ---------------------------------------------------------------------------

-- profiles_update (0002) lets an account update its own row, and Supabase's default grants give
-- `authenticated` UPDATE on every column. Since 0018 that row carries is_platform_admin, so any
-- signed-in user could make themselves an Appointly staff admin with a single PostgREST call:
--
--   supabase.from('profiles').update({ is_platform_admin: true }).eq('id', <own id>)
--
-- The same path could also claim a username (0023) or forge a terms-acceptance stamp (0024).
-- The policy stays as it is; the column grant is what decides which columns it may touch.
-- The app writes none of these from the browser, so nothing in the UI changes.
revoke update on profiles from authenticated;
grant update (full_name, avatar_url) on profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. notifications: only the read flag
-- ---------------------------------------------------------------------------

-- 0009 says "only is_read may be toggled by a business member", but notifications_update covers
-- every column, so a member could rewrite the title and message of a payment notification --
-- including the rejection reason their own admin wrote. Same fix, at the column grant.
revoke update on notifications from authenticated;
grant update (is_read) on notifications to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Storage policies: a bad folder name should deny, not error
-- ---------------------------------------------------------------------------

-- The payment-proofs and service-images policies cast the first path segment straight to uuid.
-- An upload to `payment-proofs/whatever/x.png` therefore raised 22P02 ("invalid input syntax for
-- type uuid") from inside a policy instead of simply being refused, which surfaces a Postgres
-- error to the user and makes a denial look like an outage.
create function is_business_admin_folder(p_folder text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid;
begin
  begin
    v_id := p_folder::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return is_business_admin(v_id);
end $$;

create function is_business_member_folder(p_folder text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid;
begin
  begin
    v_id := p_folder::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return is_business_member(v_id);
end $$;

revoke execute on function is_business_admin_folder, is_business_member_folder from public, anon;
grant execute on function is_business_admin_folder, is_business_member_folder to authenticated;

drop policy if exists payment_proofs_insert on storage.objects;
create policy payment_proofs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-proofs'
              and is_business_admin_folder((storage.foldername(name))[1]));

drop policy if exists payment_proofs_select on storage.objects;
create policy payment_proofs_select on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs'
         and (is_platform_admin() or is_business_member_folder((storage.foldername(name))[1])));

drop policy if exists service_images_admin_write on storage.objects;
create policy service_images_admin_write on storage.objects for insert to authenticated
  with check (bucket_id = 'service-images'
              and is_business_admin_folder((storage.foldername(name))[1]));

drop policy if exists service_images_admin_update on storage.objects;
create policy service_images_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'service-images' and is_business_admin_folder((storage.foldername(name))[1]))
  with check (bucket_id = 'service-images' and is_business_admin_folder((storage.foldername(name))[1]));

drop policy if exists service_images_admin_delete on storage.objects;
create policy service_images_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'service-images' and is_business_admin_folder((storage.foldername(name))[1]));

-- The payment-proofs bucket was created private in 0018, but a project that ran an older copy of
-- that migration (or flipped it in the dashboard) would serve receipts over public URLs. Assert it.
update storage.buckets
   set public = false, file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'payment-proofs';

-- service-images is deliberately public (it renders on the public booking page), but it was
-- created with no size or type limit, so any file an admin's browser would send was accepted.
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'service-images';

update storage.buckets
   set file_size_limit = 2097152,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
 where id = 'payment-assets';

-- ---------------------------------------------------------------------------
-- 4. Index
-- ---------------------------------------------------------------------------

-- customers only had the partial unique index on (business_id, lower(email)) where email is not
-- null, which the planner cannot use for a plain "this business's customers" scan -- the query
-- behind the Customers page, and behind create_booking's phone-only customer lookup.
create index if not exists customers_business_id_idx on customers (business_id);
