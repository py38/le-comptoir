-- =========================================================
-- Le Comptoir — Schéma réservation (par JOUR) · Supabase
-- À coller dans : Supabase → SQL Editor → Run
-- =========================================================

-- Réglages généraux (ex: capacité par défaut)
create table if not exists public.settings (
  key text primary key,
  value text
);
insert into public.settings(key, value) values ('default_capacity', '60')
  on conflict (key) do nothing;

-- Réglages par jour (surcharge de capacité, fermeture)
create table if not exists public.day_settings (
  date date primary key,
  capacity int check (capacity >= 0),
  closed boolean not null default false
);

-- Réservations
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  time text not null,
  name text not null,
  phone text not null,
  party_size int not null check (party_size > 0),
  note text,
  status text not null default 'confirmed',
  created_at timestamptz default now()
);
create index if not exists bookings_date_idx on public.bookings(date);

-- Vue publique : disponibilité par jour (couverts) sans exposer les réservations
create or replace view public.day_availability as
select d.date,
  coalesce(ds.capacity, (select value::int from public.settings where key = 'default_capacity'), 60) as capacity,
  coalesce(ds.closed, false) as closed,
  coalesce(sum(b.party_size), 0)::int as booked
from (
  select date from public.bookings
  union
  select date from public.day_settings
) d
left join public.day_settings ds on ds.date = d.date
left join public.bookings b on b.date = d.date
group by d.date, ds.capacity, ds.closed;

-- Sécurité (RLS)
alter table public.settings     enable row level security;
alter table public.day_settings enable row level security;
alter table public.bookings     enable row level security;

drop policy if exists "settings_read" on public.settings;
create policy "settings_read" on public.settings for select using (true);
drop policy if exists "settings_admin" on public.settings;
create policy "settings_admin" on public.settings for all to authenticated using (true) with check (true);

drop policy if exists "days_read" on public.day_settings;
create policy "days_read" on public.day_settings for select using (true);
drop policy if exists "days_admin" on public.day_settings;
create policy "days_admin" on public.day_settings for all to authenticated using (true) with check (true);

drop policy if exists "bookings_admin_read" on public.bookings;
create policy "bookings_admin_read" on public.bookings for select to authenticated using (true);
drop policy if exists "bookings_admin_write" on public.bookings;
create policy "bookings_admin_write" on public.bookings for all to authenticated using (true) with check (true);

-- Réservation ATOMIQUE (auto-confirmée si couverts suffisants)
create or replace function public.create_booking(
  p_date date, p_time text, p_party int, p_name text, p_phone text, p_note text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap int; v_closed boolean; v_booked int; v_remaining int; v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_date::text));  -- anti-surbooking
  if p_party is null or p_party < 1 then return json_build_object('ok', false, 'reason', 'Nombre de personnes invalide'); end if;

  select coalesce(capacity, (select value::int from public.settings where key = 'default_capacity'), 60),
         coalesce(closed, false)
    into v_cap, v_closed
  from public.day_settings where date = p_date;

  if v_cap is null then
    v_cap := coalesce((select value::int from public.settings where key = 'default_capacity'), 60);
    v_closed := false;
  end if;
  if v_closed then return json_build_object('ok', false, 'reason', 'Le restaurant est fermé ce jour-là.'); end if;

  select coalesce(sum(party_size), 0) into v_booked from public.bookings where date = p_date;
  v_remaining := v_cap - v_booked;
  if p_party > v_remaining then
    return json_build_object('ok', false, 'reason', 'Il ne reste que ' || v_remaining || ' couvert(s) pour cette date.');
  end if;

  insert into public.bookings(date, time, name, phone, party_size, note)
  values (p_date, p_time, p_name, p_phone, p_party, p_note) returning id into v_id;
  return json_build_object('ok', true, 'id', v_id);
end; $$;

grant select on public.day_availability to anon, authenticated;
grant execute on function public.create_booking(date, text, int, text, text, text) to anon, authenticated;

-- Temps réel (rafraîchissement auto de l'admin)
do $$ begin
  alter publication supabase_realtime add table public.bookings;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.day_settings;
exception when duplicate_object then null; end $$;
