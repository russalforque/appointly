-- Users who signed up before the profiles trigger existed have no profiles row,
-- which makes create_business fail on the business_members foreign key (HTTP 409).
insert into profiles (id, full_name)
select id, raw_user_meta_data ->> 'full_name' from auth.users
on conflict (id) do nothing;

-- create_business now self-heals a missing profile.
create or replace function create_business(p_name text, p_slug text, p_category text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare bid uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  insert into profiles (id) values (auth.uid()) on conflict (id) do nothing;
  if (select count(*) from business_members where user_id = auth.uid() and role = 'owner') >= 3 then
    raise exception 'Business limit reached';
  end if;
  insert into businesses (name, slug, category) values (p_name, p_slug, p_category) returning id into bid;
  insert into business_members (business_id, user_id, role) values (bid, auth.uid(), 'owner');
  insert into business_settings (business_id) values (bid);
  return bid;
end $$;
