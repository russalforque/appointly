-- Staff sign in with a username, not a business email address.
--
-- Supabase Auth only knows email/password, so a username is a lookup that resolves to the
-- account's email before the normal password sign-in runs. Usernames exist for staff accounts
-- only: a business owner still signs in with the email they registered with.
--
-- This migration also seeds the first admin account, because the very first one cannot be
-- granted by an existing admin. Set the password below before running it, and change it again
-- from Supabase Auth once you are in.
--
-- This file is committed to the repository, so a real password must never be left in it: put a
-- value in, run the migration, then restore the placeholder. The guard below is what keeps the
-- placeholder itself from ever becoming a live credential.

-- ---------------------------------------------------------------------------
-- 1. Usernames
-- ---------------------------------------------------------------------------

alter table profiles add column if not exists username text;

-- Lower-case only, so 'Admin' and 'admin' can never be two different people.
alter table profiles drop constraint if exists profiles_username_format;
alter table profiles add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9][a-z0-9_.-]{2,29}$');

create unique index if not exists profiles_username_key on profiles (username) where username is not null;

comment on column profiles.username is
  'Sign-in name for staff accounts. Null for ordinary accounts, which sign in by email.';

-- Resolves a username to the account's email so the client can call signInWithPassword.
--
-- This is deliberately callable by anon: it is the only way a username can be used to sign in
-- at all. It reveals nothing about ordinary accounts, which have no username, and knowing an
-- admin's email address is not on its own a way into the account.
create function auth_email_for_username(p_username text) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_email text;
begin
  select u.email::text into v_email
    from profiles p join auth.users u on u.id = p.id
   where p.username = lower(btrim(p_username));
  return v_email;
end $$;

revoke execute on function auth_email_for_username from public;
grant execute on function auth_email_for_username to anon, authenticated;

-- Give an admin account its sign-in name. Admin-only, and the username has to be free.
create function admin_set_username(p_email text, p_username text)
returns table (user_id uuid, email text, username text)
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_email text := lower(nullif(btrim(p_email), ''));
  v_username text := lower(nullif(btrim(p_username), ''));
begin
  if not is_platform_admin() then raise exception 'You do not have permission to manage admins'; end if;
  if v_email is null then raise exception 'An email address is required'; end if;

  select u.id into v_id from auth.users u where lower(u.email) = v_email;
  if v_id is null then raise exception 'No Appointly account uses that email address'; end if;

  if v_username is not null and exists (
    select 1 from profiles where username = v_username and id <> v_id
  ) then
    raise exception 'That username is already taken';
  end if;

  update profiles set username = v_username where id = v_id;

  return query select p.id, u.email::text, p.username
                 from profiles p join auth.users u on u.id = p.id
                where p.id = v_id;
end $$;

revoke execute on function admin_set_username from public, anon;
grant execute on function admin_set_username to authenticated;

-- The admins list gains the username column added above. The return type changes, so the
-- 0022 version has to go rather than be replaced.
drop function if exists admin_list_admins();
create function admin_list_admins()
returns table (user_id uuid, full_name text, username text, email text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'You do not have permission to view admins'; end if;
  return query
    select p.id, p.full_name, p.username, u.email::text, u.created_at
      from profiles p join auth.users u on u.id = p.id
     where p.is_platform_admin
     order by u.created_at;
end $$;

revoke execute on function admin_list_admins from public, anon;
grant execute on function admin_list_admins to authenticated;

-- The signed-in account's own sign-in name, for the "Your sign-in" panel.
create function my_username() returns text
language sql stable security definer set search_path = public as $$
  select username from profiles where id = auth.uid()
$$;
revoke execute on function my_username from public, anon;
grant execute on function my_username to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The first admin account
-- ---------------------------------------------------------------------------

-- Creates the account straight in auth.users, the way Supabase's own "add user" does. The email
-- is never used for sign-in or mail — it exists because GoTrue requires one — so a .local
-- address is fine and is marked confirmed so no verification link is needed.
--
-- Already seeded (or the email already registered) => this block only tops up the username and
-- the admin flag, so re-running never resets a password you have since changed.
do $seed$
declare
  v_username text := 'admin';
  v_email    text := 'admin@appointly.local';
  v_password text := 'SET-ME-BEFORE-RUNNING';   -- see the header; never commit a real value
  v_name     text := 'Appointly Admin';
  v_id       uuid;
  v_has_provider_id boolean;
  v_col      text;
begin
  select id into v_id from auth.users where lower(email) = v_email;

  if v_id is null then
    if v_password = 'SET-ME-BEFORE-RUNNING' then
      raise exception
        'Set v_password in 0023_admin_username_login.sql before creating the first admin account';
    end if;
    v_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      v_email, extensions.crypt(v_password, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_name), now(), now()
    );

    -- GoTrue needs a matching identity row or the password grant finds no provider. Newer
    -- versions split the old text id into (id uuid, provider_id text), so write whichever
    -- shape this project's auth schema actually has.
    select exists (
      select 1 from information_schema.columns
       where table_schema = 'auth' and table_name = 'identities' and column_name = 'provider_id'
    ) into v_has_provider_id;

    if v_has_provider_id then
      insert into auth.identities (id, user_id, provider_id, identity_data, provider,
                                   last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), v_id, v_id::text,
              jsonb_build_object('sub', v_id::text, 'email', v_email), 'email', now(), now(), now());
    else
      execute 'insert into auth.identities (id, user_id, identity_data, provider,
                                            last_sign_in_at, created_at, updated_at)
               values ($1, $2, $3, $4, now(), now(), now())'
        using v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', v_email), 'email';
    end if;
  end if;

  -- GoTrue reads the token columns as plain strings. A row inserted by hand leaves them NULL,
  -- which several versions fail to scan -- the sign-in then comes back as bad credentials even
  -- though the password is right. Blanking them is what the dashboard's own "add user" does.
  -- Written column by column because which of them exist depends on the GoTrue version.
  for v_col in
    select c.column_name
      from information_schema.columns c
     where c.table_schema = 'auth' and c.table_name = 'users'
       and c.data_type in ('character varying', 'text')
       and c.column_name in ('confirmation_token', 'recovery_token', 'email_change',
                             'email_change_token_new', 'email_change_token_current',
                             'phone_change', 'phone_change_token', 'reauthentication_token')
  loop
    execute format('update auth.users set %I = %L where id = %L and %I is null', v_col, '', v_id, v_col);
  end loop;

  -- handle_new_user() already inserted the profile; this is for a hand-made account that has none.
  insert into profiles (id, full_name) values (v_id, v_name) on conflict (id) do nothing;

  update profiles
     set is_platform_admin = true,
         username = coalesce(username, v_username),
         full_name = coalesce(full_name, v_name)
   where id = v_id;
end $seed$;
