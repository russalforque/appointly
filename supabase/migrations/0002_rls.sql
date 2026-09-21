-- Authorization helpers (security definer avoids RLS recursion on business_members)
create function is_business_member(bid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from business_members where business_id = bid and user_id = auth.uid())
$$;

create function is_business_admin(bid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from business_members
    where business_id = bid and user_id = auth.uid() and role in ('owner', 'admin'))
$$;

create function is_business_owner(bid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from business_members
    where business_id = bid and user_id = auth.uid() and role = 'owner')
$$;

-- Creates a business and makes the caller its owner (direct inserts are not allowed)
create function create_business(p_name text, p_slug text, p_category text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare bid uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  insert into businesses (name, slug, category) values (p_name, p_slug, p_category) returning id into bid;
  insert into business_members (business_id, user_id, role) values (bid, auth.uid(), 'owner');
  insert into business_settings (business_id) values (bid);
  return bid;
end $$;
revoke execute on function create_business from public, anon;
grant execute on function create_business to authenticated;

alter table profiles enable row level security;
alter table businesses enable row level security;
alter table business_members enable row level security;
alter table business_settings enable row level security;
alter table services enable row level security;
alter table staff enable row level security;
alter table staff_services enable row level security;
alter table staff_schedules enable row level security;
alter table staff_days_off enable row level security;
alter table customers enable row level security;
alter table bookings enable row level security;

-- profiles: own row only
create policy profiles_select on profiles for select to authenticated using (id = auth.uid());
create policy profiles_update on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- businesses: public read of active ones; admins edit; owner deletes
create policy businesses_public_read on businesses for select to anon, authenticated
  using (is_active or is_business_member(id));
create policy businesses_update on businesses for update to authenticated
  using (is_business_admin(id)) with check (is_business_admin(id));
create policy businesses_delete on businesses for delete to authenticated
  using (is_business_owner(id));

-- business_members: members can see teammates; only owner manages
create policy members_select on business_members for select to authenticated
  using (is_business_member(business_id));
create policy members_insert on business_members for insert to authenticated
  with check (is_business_owner(business_id));
create policy members_update on business_members for update to authenticated
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy members_delete on business_members for delete to authenticated
  using (is_business_owner(business_id));

-- business_settings: public read (needed by booking page), admins write
create policy settings_read on business_settings for select to anon, authenticated using (true);
create policy settings_write on business_settings for all to authenticated
  using (is_business_admin(business_id)) with check (is_business_admin(business_id));

-- services / staff / staff_services: public read of active catalogue, admins write
create policy services_read on services for select to anon, authenticated
  using (is_active or is_business_member(business_id));
create policy services_write on services for all to authenticated
  using (is_business_admin(business_id)) with check (is_business_admin(business_id));

create policy staff_read on staff for select to anon, authenticated
  using (is_active or is_business_member(business_id));
create policy staff_write on staff for all to authenticated
  using (is_business_admin(business_id)) with check (is_business_admin(business_id));

create policy staff_services_read on staff_services for select to anon, authenticated using (true);
create policy staff_services_write on staff_services for all to authenticated
  using (is_business_admin(business_id)) with check (is_business_admin(business_id));

-- schedules / days off: members read, admins write (public availability goes through Phase 4 RPCs)
create policy schedules_read on staff_schedules for select to authenticated
  using (exists (select 1 from staff s where s.id = staff_id and is_business_member(s.business_id)));
create policy schedules_write on staff_schedules for all to authenticated
  using (exists (select 1 from staff s where s.id = staff_id and is_business_admin(s.business_id)))
  with check (exists (select 1 from staff s where s.id = staff_id and is_business_admin(s.business_id)));

create policy days_off_read on staff_days_off for select to authenticated
  using (exists (select 1 from staff s where s.id = staff_id and is_business_member(s.business_id)));
create policy days_off_write on staff_days_off for all to authenticated
  using (exists (select 1 from staff s where s.id = staff_id and is_business_admin(s.business_id)))
  with check (exists (select 1 from staff s where s.id = staff_id and is_business_admin(s.business_id)));

-- customers / bookings: members only; public booking creation goes through a Phase 4 RPC
create policy customers_all on customers for all to authenticated
  using (is_business_member(business_id)) with check (is_business_member(business_id));
create policy bookings_all on bookings for all to authenticated
  using (is_business_member(business_id)) with check (is_business_member(business_id));
