-- =========================================================
-- Le Comptoir — Couverts DIFFÉRENTS selon le jour de la semaine
-- (ex: Déjeuner = 40 le lundi, 60 le samedi)
-- À coller dans : Supabase → SQL Editor → Run
-- =========================================================

-- Capacité par jour de semaine : {"1":40,"6":80}  (0=dim … 6=sam)
-- Vide/absent = on utilise la capacité par défaut du service.
alter table public.services add column if not exists caps_by_day jsonb not null default '{}'::jsonb;

-- Priorité : surcharge d'une DATE précise > capacité du JOUR DE SEMAINE > capacité par défaut
create or replace function public.day_services(p_date date)
returns table (
  service_id uuid, name text, start_time text, end_time text,
  capacity int, closed boolean, booked int, remaining int
)
language sql security definer set search_path = public stable
as $$
  with base as (
    select
      s.id, s.name, s.start_time, s.end_time, s.sort,
      coalesce(
        o.capacity,                                                        -- 1) date précise
        nullif(s.caps_by_day ->> extract(dow from p_date)::text, '')::int, -- 2) jour de semaine
        s.capacity                                                         -- 3) défaut
      )::int as capacity,
      coalesce(o.closed, false) as closed
    from public.services s
    left join public.service_overrides o on o.service_id = s.id and o.date = p_date
    where s.active and (extract(dow from p_date)::int = any(s.weekdays))
  )
  select
    b.id, b.name, b.start_time, b.end_time, b.capacity, b.closed,
    coalesce((select sum(bk.party_size)::int from public.bookings bk
              where bk.date = p_date and bk.service_id = b.id and bk.status = 'confirmed'), 0) as booked,
    greatest(b.capacity - coalesce((select sum(bk.party_size)::int from public.bookings bk
              where bk.date = p_date and bk.service_id = b.id and bk.status = 'confirmed'), 0), 0)::int as remaining
  from base b
  order by b.sort, b.start_time;
$$;

grant execute on function public.day_services(date) to anon, authenticated;
