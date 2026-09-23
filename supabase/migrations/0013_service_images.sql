-- Optional service photo, shown on the public booking page
alter table services add column if not exists image_url text;

-- Public bucket for service photos; path convention: <business_id>/<file>
insert into storage.buckets (id, name, public)
values ('service-images', 'service-images', true)
on conflict (id) do nothing;

drop policy if exists service_images_public_read on storage.objects;
create policy service_images_public_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'service-images');

drop policy if exists service_images_admin_write on storage.objects;
create policy service_images_admin_write on storage.objects for insert to authenticated
  with check (bucket_id = 'service-images' and is_business_admin((storage.foldername(name))[1]::uuid));

drop policy if exists service_images_admin_update on storage.objects;
create policy service_images_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'service-images' and is_business_admin((storage.foldername(name))[1]::uuid))
  with check (bucket_id = 'service-images' and is_business_admin((storage.foldername(name))[1]::uuid));

drop policy if exists service_images_admin_delete on storage.objects;
create policy service_images_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'service-images' and is_business_admin((storage.foldername(name))[1]::uuid));
