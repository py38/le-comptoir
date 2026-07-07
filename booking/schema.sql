-- =========================================================
-- Le Comptoir — Schéma réservation (Supabase / PostgreSQL)
-- À coller dans : Supabase → SQL Editor → Run
-- =========================================================

-- 1) Créneaux ouverts par le restaurant
create table if not exists public.availability (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  time time not null,
  capacity int not null check (capacity >= 0),   -- capacité en NOMBRE DE COUVERTS
  blocked boolean not null default false,
  created_at timestamptz default now(),
  unique (date, time)
);

-- 2) Réservations clients
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  availability_id uuid references public.availability(id) on delete cascade,
  date date not null,
  time time not null,
  name text not null,
  phone text not null,
  party_size int not null check (party_size > 0),
  note text,
  status text not null default 'confirmed',
  created_at timestamptz default now()
);

-- 3) Vue publique : disponibilité par créneau (n'expose PAS les réservations)
create or replace view public.slot_availability as
select a.id, a.date, a.time, a.capacity, a.blocked,
       coalesce(sum(b.party_size), 0)::int as booked,
       (a.capacity - coalesce(sum(b.party_size), 0))::int as remaining
from public.availability a
left join public.bookings b on b.availability_id = a.id
group by a.id;

-- 4) Sécurité (RLS)
alter table public.availability enable row level security;
alter table public.bookings    enable row level security;

drop policy if exists "avail_public_read" on public.availability;
create policy "avail_public_read" on public.availability
  for select using (true);

drop policy if exists "avail_admin_write" on public.availability;
create policy "avail_admin_write" on public.availability
  for all to authenticated using (true) with check (true);

drop policy if exists "bookings_admin_read" on public.bookings;
create policy "bookings_admin_read" on public.bookings
  for select to authenticated using (true);

drop policy if exists "bookings_admin_write" on public.bookings;
create policy "bookings_admin_write" on public.bookings
  for all to authenticated using (true) with check (true);

-- 5) Réservation ATOMIQUE (auto-confirmée si capacité suffisante)
create or replace function public.create_booking(
  p_slot uuid, p_name text, p_phone text, p_party int, p_note text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap int; v_blocked boolean; v_date date; v_time time; v_booked int; v_remaining int; v_id uuid;
begin
  select capacity, blocked, date, time
    into v_cap, v_blocked, v_date, v_time
  from public.availability where id = p_slot for update;

  if v_cap is null then return json_build_object('ok', false, 'reason', 'Créneau introuvable'); end if;
  if v_blocked   then return json_build_object('ok', false, 'reason', 'Créneau indisponible'); end if;
  if p_party is null or p_party < 1 then return json_build_object('ok', false, 'reason', 'Nombre de personnes invalide'); end if;

  select coalesce(sum(party_size), 0) into v_booked from public.bookings where availability_id = p_slot;
  v_remaining := v_cap - v_booked;
  if p_party > v_remaining then
    return json_build_object('ok', false, 'reason', 'Il ne reste que ' || v_remaining || ' place(s) sur ce créneau.');
  end if;

  insert into public.bookings(availability_id, date, time, name, phone, party_size, note)
  values (p_slot, v_date, v_time, p_name, p_phone, p_party, p_note)
  returning id into v_id;

  return json_build_object('ok', true, 'id', v_id);
end; $$;

-- 6) Permissions d'accès public (lecture dispo + appel de la fonction)
grant select on public.slot_availability to anon, authenticated;
grant execute on function public.create_booking(uuid, text, text, int, text) to anon, authenticated;
