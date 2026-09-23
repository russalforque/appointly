-- Fixes: "function gen_random_bytes(integer) does not exist" when starting a payment.
--
-- gen_random_bytes comes from pgcrypto, which Supabase installs into the `extensions` schema.
-- 0018 pinned gen_payment_reference to `search_path = public`, so the function was invisible at
-- runtime even though the extension was present. (gen_random_uuid is core Postgres, which is why
-- everything else in 0018 worked.)

create extension if not exists pgcrypto;

create or replace function gen_payment_reference() returns text
language plpgsql volatile set search_path = public, extensions as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  suffix text := '';
  bytes bytea := gen_random_bytes(6);
begin
  for i in 0..5 loop
    suffix := suffix || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return 'APT-' || to_char(now() at time zone 'Asia/Manila', 'YYYYMMDD') || '-' || suffix;
end $$;

revoke execute on function gen_payment_reference from public, anon;
