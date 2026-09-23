-- Platform-admin accounts and manual plan management.
--
-- Two things live here:
--   1. Bootstrapping a staff-only account (is_platform_admin, no business of its own) and a
--      guarded RPC so an existing admin can promote or demote another account later.
--   2. Letting an admin set a business's plan by hand -- the case the payment flow does not
--      cover: comped accounts, an extended trial, a refund, or a plan changed after support
--      talked to the owner.
--
-- As everywhere else in this schema the authorization lives in the database; the UI only
-- decides what to draw.

-- ---------------------------------------------------------------------------
-- 1. Admin accounts
-- ---------------------------------------------------------------------------

-- Bootstrap. Put the emails of the staff accounts you have already registered through the
-- normal sign-up form in this list, then run the migration. Unknown emails are skipped, so
-- re-running is safe and an empty list is a no-op.
do $bootstrap$
declare
  v_emails text[] := array[
    -- 'admin@appointly.ph'
  ]::text[];
begin
  if array_length(v_emails, 1) is null then return; end if;
  update profiles p
     set is_platform_admin = true
    from auth.users u
   where u.id = p.id
     and lower(u.email) in (select lower(t.em) from unnest(v_emails) as t(em));
end $bootstrap$;

-- Promote or demote another account. Admin-only, and an admin may not demote themselves --
-- that is what stops the last pair of hands from locking everyone out by accident.
create function admin_set_platform_admin(p_email text, p_is_admin boolean)
returns table (user_id uuid, email text, is_admin boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_email text := lower(nullif(btrim(p_email), ''));
begin
  if not is_platform_admin() then raise exception 'You do not have permission to manage admins'; end if;
  if v_email is null then raise exception 'An email address is required'; end if;

  select u.id into v_id from auth.users u where lower(u.email) = v_email;
  if v_id is null then raise exception 'No Appointly account uses that email address'; end if;
  if v_id = auth.uid() and not coalesce(p_is_admin, false) then
    raise exception 'You cannot remove your own admin access';
  end if;

  update profiles set is_platform_admin = coalesce(p_is_admin, false) where id = v_id;

  return query
    select p.id, u.email::text, p.is_platform_admin
      from profiles p join auth.users u on u.id = p.id
     where p.id = v_id;
end $$;

revoke execute on function admin_set_platform_admin from public, anon;
grant execute on function admin_set_platform_admin to authenticated;

-- Every platform admin, so the admins page can list who has access.
create function admin_list_admins()
returns table (user_id uuid, full_name text, email text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'You do not have permission to view admins'; end if;
  return query
    select p.id, p.full_name, u.email::text, u.created_at
      from profiles p join auth.users u on u.id = p.id
     where p.is_platform_admin
     order by u.created_at;
end $$;

revoke execute on function admin_list_admins from public, anon;
grant execute on function admin_list_admins to authenticated;

-- Does the caller belong to any business? A staff-only admin does not, and the admin shell
-- uses this to decide whether a "back to dashboard" link means anything for this account.
create function has_any_business() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from business_members where user_id = auth.uid())
$$;
revoke execute on function has_any_business from public, anon;
grant execute on function has_any_business to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Plans an admin can assign
-- ---------------------------------------------------------------------------

-- plans_read only exposes active plans. An admin also needs the retired ones, because a
-- business may still be sitting on one and the directory has to name it.
create function admin_list_plans()
returns setof plans
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'You do not have permission to view plans'; end if;
  return query select * from plans order by sort_order, price_cents;
end $$;

revoke execute on function admin_list_plans from public, anon;
grant execute on function admin_list_plans to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Setting a business's plan by hand
-- ---------------------------------------------------------------------------

-- p_status is limited to the states an admin can justify on their own. 'pending' is left out
-- deliberately: it means "a payment is waiting to be verified", which only the payment flow
-- may say. The end date decides access, so it is validated here rather than trusted.
create function admin_set_business_plan(
  p_business_id uuid,
  p_plan_id text,
  p_status text,
  p_period_end timestamptz default null,
  p_note text default null
) returns subscriptions
language plpgsql security definer set search_path = public as $$
declare
  v_plan plans;
  v_sub subscriptions;
  v_has_sub boolean;
  v_end timestamptz;
  v_note text := nullif(btrim(p_note), '');
  v_before jsonb;
begin
  if not is_platform_admin() then raise exception 'You do not have permission to change plans'; end if;
  if p_status not in ('trialing', 'active', 'past_due', 'cancelled') then
    raise exception 'Unsupported subscription status';
  end if;

  if not exists (select 1 from businesses where id = p_business_id) then
    raise exception 'That business no longer exists';
  end if;

  select * into v_plan from plans where id = p_plan_id;
  if not found then raise exception 'That plan does not exist'; end if;

  select * into v_sub from subscriptions where business_id = p_business_id for update;
  v_has_sub := found;
  v_before := case when v_has_sub then
    jsonb_build_object('plan_id', v_sub.plan_id, 'status', v_sub.status,
                       'trial_end', v_sub.trial_end, 'current_period_end', v_sub.current_period_end)
    else '{}'::jsonb end;

  -- A live plan needs an end date. Defaulting it from the plan's own interval means the common
  -- case ("give them another month") takes no date entry at all.
  if p_status in ('trialing', 'active') then
    v_end := coalesce(
      p_period_end,
      now() + case v_plan.interval when 'year' then interval '1 year' else interval '1 month' end
    );
    if v_end <= now() then raise exception 'The end date must be in the future'; end if;
    if v_end > now() + interval '5 years' then raise exception 'The end date is too far in the future'; end if;
  else
    v_end := null;
  end if;

  if v_has_sub then
    update subscriptions
       set plan_id = v_plan.id,
           status = p_status,
           trial_start = case when p_status = 'trialing' then coalesce(v_sub.trial_start, now()) else v_sub.trial_start end,
           trial_end = case when p_status = 'trialing' then v_end else v_sub.trial_end end,
           current_period_start = case when p_status = 'active' then now() else v_sub.current_period_start end,
           current_period_end = case when p_status = 'active' then v_end else v_sub.current_period_end end
     where id = v_sub.id
     returning * into v_sub;
  else
    -- A hand-set plan was not paid through a gateway, so a brand-new row reads as manual.
    insert into subscriptions (business_id, user_id, plan_id, status, provider,
                               trial_start, trial_end, current_period_start, current_period_end)
    values (p_business_id,
            (select m.user_id from business_members m
              where m.business_id = p_business_id and m.role = 'owner'
              order by m.created_at limit 1),
            v_plan.id, p_status, 'gotyme',
            case when p_status = 'trialing' then now() end,
            case when p_status = 'trialing' then v_end end,
            case when p_status = 'active' then now() end,
            case when p_status = 'active' then v_end end)
    returning * into v_sub;
  end if;

  insert into payment_audit_log (business_id, actor_id, action, detail)
  values (p_business_id, auth.uid(), 'plan_set_by_admin',
          jsonb_build_object('before', v_before, 'plan_id', v_plan.id, 'status', p_status,
                             'ends_at', v_end, 'note', v_note));

  -- The owner finds out from their own dashboard, not from an email we never send.
  insert into notifications (business_id, type, title, message)
  values (p_business_id, 'plan_updated', 'Your plan was updated',
          case p_status
            when 'active' then 'Your ' || v_plan.name || ' plan is active until ' ||
                 to_char(v_end at time zone 'Asia/Manila', 'Mon DD, YYYY') || '.'
            when 'trialing' then 'You are on a ' || v_plan.name || ' trial until ' ||
                 to_char(v_end at time zone 'Asia/Manila', 'Mon DD, YYYY') || '.'
            when 'past_due' then 'Your ' || v_plan.name || ' subscription is past due. Pay to restore access.'
            else 'Your ' || v_plan.name || ' subscription has been cancelled.'
          end || coalesce(' ' || v_note, ''));

  return v_sub;
end $$;

revoke execute on function admin_set_business_plan from public, anon;
grant execute on function admin_set_business_plan to authenticated;
