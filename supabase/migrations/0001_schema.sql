-- Appointly core schema
create extension if not exists btree_gist;

create type member_role as enum ('owner', 'admin', 'staff');
create type booking_status as enum ('pending', 'confirmed', 'cancelled', 'completed', 'no_show');

create function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- profiles (1:1 with auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create table businesses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  category text,
  description text,
  phone text,
  email text,
  address text,
  logo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table business_members (
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role member_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index on business_members (user_id);

-- working_hours: {"mon":[{"start":"09:00","end":"18:00"}], ...}; missing/empty day = closed
create table business_settings (
  business_id uuid primary key references businesses(id) on delete cascade,
  timezone text not null default 'UTC',
  working_hours jsonb not null default '{}',
  blocked_dates date[] not null default '{}',
  slot_interval_minutes int not null default 30 check (slot_interval_minutes between 5 and 240),
  min_notice_hours int not null default 2 check (min_notice_hours >= 0),
  max_advance_days int not null default 60 check (max_advance_days > 0),
  auto_confirm boolean not null default false,
  updated_at timestamptz not null default now()
);

create table services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  description text,
  duration_minutes int not null check (duration_minutes > 0),
  buffer_minutes int not null default 0 check (buffer_minutes >= 0),
  price numeric(10,2) check (price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id)
);
create index on services (business_id);

create table staff (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  name text not null,
  email text,
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id)
);
create index on staff (business_id);

-- composite FKs guarantee staff and service belong to the same business
create table staff_services (
  staff_id uuid not null,
  service_id uuid not null,
  business_id uuid not null references businesses(id) on delete cascade,
  primary key (staff_id, service_id),
  foreign key (staff_id, business_id) references staff(id, business_id) on delete cascade,
  foreign key (service_id, business_id) references services(id, business_id) on delete cascade
);
create index on staff_services (service_id);

-- day_of_week: 0 = Sunday ... 6 = Saturday; several rows per day allowed (split shifts)
create table staff_schedules (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);
create index on staff_schedules (staff_id);

create table staff_days_off (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  date date not null,
  reason text,
  unique (staff_id, date)
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  check (email is not null or phone is not null)
);
create unique index on customers (business_id, lower(email)) where email is not null;

-- end_at = appointment end INCLUDING service buffer, so the exclusion constraint blocks buffers too
create table bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  service_id uuid not null,
  staff_id uuid not null,
  customer_id uuid not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status booking_status not null default 'pending',
  notes text,
  public_token uuid not null default gen_random_uuid() unique, -- lets a customer view their booking without an account
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at),
  foreign key (service_id, business_id) references services(id, business_id),
  foreign key (staff_id, business_id) references staff(id, business_id),
  foreign key (customer_id, business_id) references customers(id, business_id),
  -- prevents double booking at the database level
  exclude using gist (staff_id with =, tstzrange(start_at, end_at) with &&)
    where (status in ('pending', 'confirmed'))
);
create index on bookings (business_id, start_at);
create index on bookings (staff_id, start_at);
create index on bookings (customer_id);

-- updated_at triggers
create trigger t_upd before update on profiles for each row execute function set_updated_at();
create trigger t_upd before update on businesses for each row execute function set_updated_at();
create trigger t_upd before update on business_settings for each row execute function set_updated_at();
create trigger t_upd before update on services for each row execute function set_updated_at();
create trigger t_upd before update on staff for each row execute function set_updated_at();
create trigger t_upd before update on customers for each row execute function set_updated_at();
create trigger t_upd before update on bookings for each row execute function set_updated_at();
