-- Platform-admin directory of businesses and their owners.
--
-- Read-only: this migration adds no new tables and no new writes. It exists because a platform
-- admin needs to see across every business, which RLS deliberately forbids for normal clients,
-- and because the owner's email lives in auth.users where no client may read it.

-- Consistency with the other functions in 0018: revoking from anon alone leaves the implicit
-- PUBLIC grant in place. The function only ever reports on its own caller, so nothing leaked,
-- but the grant should say what it means.
revoke execute on function is_platform_admin from public;
grant execute on function is_platform_admin to authenticated;

create function admin_list_businesses(p_limit int default 500)
returns table (
  id uuid, name text, slug text, category text, is_active boolean, created_at timestamptz,
  owner_id uuid, owner_name text, owner_email text,
  plan_id text, plan_name text, subscription_status text,
  trial_end timestamptz, current_period_end timestamptz, provider text,
  member_count bigint, booking_count bigint
)
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'You do not have permission to view businesses'; end if;
  -- Keeps a stale 'active' row from reading as paid in the directory.
  perform expire_due_subscriptions();

  return query
    select b.id, b.name, b.slug, b.category, b.is_active, b.created_at,
           o.user_id, pr.full_name, u.email::text,
           s.plan_id, pl.name, s.status, s.trial_end, s.current_period_end, s.provider,
           (select count(*) from business_members m where m.business_id = b.id),
           (select count(*) from bookings bk where bk.business_id = b.id)
      from businesses b
      -- The owner is the account that pays and is contacted; a business has exactly one.
      left join lateral (
        select m.user_id from business_members m
         where m.business_id = b.id and m.role = 'owner'
         order by m.created_at limit 1
      ) o on true
      left join profiles pr on pr.id = o.user_id
      left join auth.users u on u.id = o.user_id
      left join subscriptions s on s.business_id = b.id
      left join plans pl on pl.id = s.plan_id
     order by b.created_at desc
     limit greatest(1, least(coalesce(p_limit, 500), 1000));
end $$;

revoke execute on function admin_list_businesses from public, anon;
grant execute on function admin_list_businesses to authenticated;
