-- Sample business (no members; add yourself to business_members after signing up)
with b as (
  insert into businesses (slug, name, category, description)
  values ('demo-salon', 'Demo Salon', 'salon', 'Sample business for development')
  returning id
), st as (
  insert into business_settings (business_id, timezone, working_hours)
  select id, 'UTC', '{"mon":[{"start":"09:00","end":"18:00"}],"tue":[{"start":"09:00","end":"18:00"}],"wed":[{"start":"09:00","end":"18:00"}],"thu":[{"start":"09:00","end":"18:00"}],"fri":[{"start":"09:00","end":"18:00"}],"sat":[{"start":"10:00","end":"16:00"}]}'::jsonb
  from b
), sv as (
  insert into services (business_id, name, duration_minutes, buffer_minutes, price)
  select b.id, x.name, x.dur, x.buf, x.price from b,
    (values ('Haircut', 60, 0, 25.00), ('Hair Color', 120, 15, 80.00)) as x(name, dur, buf, price)
  returning id, business_id
), sf as (
  insert into staff (business_id, name)
  select b.id, x from b, unnest(array['Maria', 'John']) as x
  returning id, business_id
), ss as (
  insert into staff_services (staff_id, service_id, business_id)
  select sf.id, sv.id, sf.business_id from sf, sv
)
insert into staff_schedules (staff_id, day_of_week, start_time, end_time)
select sf.id, d, '09:00', '18:00' from sf, generate_series(1, 5) d;
