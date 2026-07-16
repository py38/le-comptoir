-- =========================================================
-- Le Comptoir — MIGRATION : capacité par SERVICE
-- À coller dans : Supabase → SQL Editor → Run
-- (à lancer une seule fois, après le schema.sql initial)
-- =========================================================

-- 1) Les services (Déjeuner, Dîner, 1er/2e service…) — gérés depuis l'admin
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_time text not null,                 -- "12:00"
  end_time   text not null,                 -- "15:00"
  capacity   int  not null check (capacity >= 0),
  weekdays   int[] not null default '{0,1,2,3,4,5,6}',  -- 0=dim … 6=sam
  sort       int  not null default 0,
  active     boolean not null default true,
  created_at timestamptz default now()
);

-- 2) Surcharges par date (capacité spéciale ou service fermé ce jour-là)
create table if not exists public.service_overrides (
  date date not null,
  service_id uuid not null references public.services(id) on delete cascade,
  capacity int check (capacity >= 0),
  closed boolean not null default false,
  primary key (date, service_id)
);

-- 3) Les réservations sont rattachées à un service
alter table public.bookings add column if not exists service_id uuid references public.services(id) on delete set null;
create index if not exists bookings_date_service_idx on public.bookings(date, service_id);
-- status : 'confirmed' (occupe des couverts) | 'done' (terminée → couverts libérés)

-- 4) Services par défaut (uniquement si aucun service n'existe encore)
insert into public.services (name, start_time, end_time, capacity, sort)
select * from (values
  ('Déjeuner', '12:00', '15:00', 60, 1),
  ('Dîner',    '19:00', '23:00', 60, 2)
) as v(name, start_time, end_time, capacity, sort)
where not exists (select 1 from public.services);

-- 5) Sécurité
alter table public.services          enable row level security;
alter table public.service_overrides enable row level security;

drop policy if exists "services_read" on public.services;
create policy "services_read" on public.services for select using (true);
drop policy if exists "services_admin" on public.services;
create policy "services_admin" on public.services for all to authenticated using (true) with check (true);

drop policy if exists "svc_ov_read" on public.service_overrides;
create policy "svc_ov_read" on public.service_overrides for select using (true);
drop policy if exists "svc_ov_admin" on public.service_overrides;
create policy "svc_ov_admin" on public.service_overrides for all to authenticated using (true) with check (true);

-- 6) Disponibilité d'une date, service par service
--    (n'expose PAS les réservations : seulement des compteurs)
create or replace function public.day_services(p_date date)
returns table (
  service_id uuid, name text, start_time text, end_time text,
  capacity int, closed boolean, booked int, remaining int
)
language sql security definer set search_path = public stable
as $$
  select
    s.id, s.name, s.start_time, s.end_time,
    coalesce(o.capacity, s.capacity)::int as capacity,
    coalesce(o.closed, false) as closed,
    coalesce((select sum(b.party_size)::int from public.bookings b
              where b.date = p_date and b.service_id = s.id and b.status = 'confirmed'), 0) as booked,
    greatest(
      coalesce(o.capacity, s.capacity)
      - coalesce((select sum(b.party_size)::int from public.bookings b
                  where b.date = p_date and b.service_id = s.id and b.status = 'confirmed'), 0),
      0)::int as remaining
  from public.services s
  left join public.service_overrides o on o.service_id = s.id and o.date = p_date
  where s.active and (extract(dow from p_date)::int = any(s.weekdays))
  order by s.sort, s.start_time;
$$;

-- 7) Disponibilité sur une période (pastilles du calendrier client)
create or replace function public.days_availability(p_from date, p_to date)
returns table (date date, remaining int, closed boolean)
language sql security definer set search_path = public stable
as $$
  select d::date,
         coalesce(sum(x.remaining), 0)::int as remaining,
         coalesce(bool_and(x.closed), true) as closed
  from generate_series(p_from, p_to, interval '1 day') d
  left join lateral public.day_services(d::date) x on true
  group by d
  order by d;
$$;

-- 8) Réservation atomique PAR SERVICE (anti-surbooking)
drop function if exists public.create_booking(date, text, int, text, text, text);
create or replace function public.create_booking(
  p_date date, p_service uuid, p_time text, p_party int,
  p_name text, p_phone text, p_note text
) returns json
language plpgsql security definer set search_path = public
as $$
declare v_cap int; v_closed boolean; v_rem int; v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_date::text || ':' || p_service::text));
  if p_party is null or p_party < 1 then
    return json_build_object('ok', false, 'reason', 'Nombre de personnes invalide');
  end if;

  select capacity, closed, remaining into v_cap, v_closed, v_rem
  from public.day_services(p_date) where service_id = p_service;

  if v_cap is null then return json_build_object('ok', false, 'reason', 'Service indisponible ce jour-là.'); end if;
  if v_closed  then return json_build_object('ok', false, 'reason', 'Service fermé ce jour-là.'); end if;
  if p_party > v_rem then
    return json_build_object('ok', false, 'reason', 'full', 'remaining', v_rem);
  end if;

  insert into public.bookings(date, time, name, phone, party_size, note, service_id, status)
  values (p_date, p_time, p_name, p_phone, p_party, p_note, p_service, 'confirmed')
  returning id into v_id;

  return json_build_object('ok', true, 'id', v_id);
end $$;

-- 9) Accès public en lecture des dispos + création de réservation
grant select on public.services to anon, authenticated;
grant execute on function public.day_services(date) to anon, authenticated;
grant execute on function public.days_availability(date, date) to anon, authenticated;
grant execute on function public.create_booking(date, uuid, text, int, text, text, text) to anon, authenticated;

-- 10) Temps réel
do $$ begin alter publication supabase_realtime add table public.services;          exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.service_overrides; exception when duplicate_object then null; end $$;
