-- Billing: free trial on signup, subscription plans, and PayMongo checkout tracking.
-- PayMongo API calls happen only in Edge Functions (supabase/functions/paymongo-*); this
-- migration only adds the trusted plan catalogue and the subscription record they read/write.

-- Single place to change the default trial length.
create function default_trial_days() returns int language sql immutable as $$ select 14 $$;

create table plans (
  id text primary key,
  name text not null,
  price_cents int not null check (price_cents >= 0),
  currency text not null default 'PHP',
  interval text not null default 'month' check (interval in ('month', 'year')),
  features jsonb not null default '[]',
  is_active boolean not null default true,
  sort_order int not null default 0
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references businesses(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  plan_id text references plans(id),
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'cancelled', 'pending')),
  trial_start timestamptz,
  trial_end timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  paymongo_checkout_id text,
  paymongo_payment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on subscriptions (paymongo_checkout_id);
create trigger t_upd before update on subscriptions for each row execute function set_updated_at();

alter table plans enable row level security;
alter table subscriptions enable row level security;

-- Plans are public pricing info; only server-side (service role) code writes them.
create policy plans_read on plans for select to anon, authenticated using (is_active);

-- Subscriptions: business members can only read their own. All writes go through
-- create_business (security definer) and the Edge Functions (service role), both of
-- which bypass RLS, so no insert/update policy is granted to authenticated users.
create policy subscriptions_select on subscriptions for select to authenticated
  using (is_business_member(business_id));

revoke all on plans, subscriptions from anon;
grant select on plans to anon, authenticated;
grant select on subscriptions to authenticated;

insert into plans (id, name, price_cents, currency, interval, features, sort_order) values
  ('starter', 'Starter', 49900, 'PHP', 'month',
   '["Online booking","Business website","Services","Staff","Calendar","Customer management"]', 1),
  ('business', 'Business', 99900, 'PHP', 'month',
   '["Everything in Starter","Booking notifications","Advanced booking settings","Priority support"]', 2);

-- create_business now also opens a free trial subscription for the new business.
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
  insert into subscriptions (business_id, user_id, status, trial_start, trial_end)
  values (bid, auth.uid(), 'trialing', now(), now() + make_interval(days => default_trial_days()));
  return bid;
end $$;
