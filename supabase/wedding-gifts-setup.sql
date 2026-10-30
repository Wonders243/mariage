-- Liste de mariage : cadeaux réservables et cagnotte externe.
-- Remplace YOUR_ADMIN_EMAIL par l'adresse du compte d'administration avant exécution.

begin;

create table if not exists public.wedding_gifts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 800),
  price_cents integer check (price_cents is null or price_cents >= 0),
  product_url text not null default '' check (product_url = '' or product_url ~* '^https://[^[:space:]]+$'),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wedding_gifts enable row level security;
revoke all on table public.wedding_gifts from public, anon, authenticated;
grant select, insert, update, delete on table public.wedding_gifts to authenticated;
grant all on table public.wedding_gifts to service_role;

drop policy if exists "Wedding admin manages gifts" on public.wedding_gifts;
create policy "Wedding admin manages gifts"
  on public.wedding_gifts
  for all
  to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = lower('YOUR_ADMIN_EMAIL'))
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = lower('YOUR_ADMIN_EMAIL'));

create index if not exists wedding_gifts_active_sort_idx
  on public.wedding_gifts (sort_order, created_at)
  where is_active = true;

-- Aucun lien avec l'invitation ou l'invité n'est conservé ici.
-- Seule une empreinte d'un jeton aléatoire permet d'annuler le choix depuis le navigateur d'origine.
create table if not exists public.wedding_gift_reservations (
  gift_id uuid primary key references public.wedding_gifts(id) on delete cascade,
  reservation_token_hash text not null check (reservation_token_hash ~ '^[a-f0-9]{64}$'),
  reserved_at timestamptz not null default now()
);

alter table public.wedding_gift_reservations enable row level security;
revoke all on table public.wedding_gift_reservations from public, anon, authenticated;
grant select (gift_id, reserved_at) on table public.wedding_gift_reservations to authenticated;
grant delete on table public.wedding_gift_reservations to authenticated;
grant all on table public.wedding_gift_reservations to service_role;

drop policy if exists "Wedding admin views anonymous gift reservations" on public.wedding_gift_reservations;
create policy "Wedding admin views anonymous gift reservations"
  on public.wedding_gift_reservations
  for select
  to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = lower('YOUR_ADMIN_EMAIL'));

drop policy if exists "Wedding admin clears anonymous gift reservations" on public.wedding_gift_reservations;
create policy "Wedding admin clears anonymous gift reservations"
  on public.wedding_gift_reservations
  for delete
  to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = lower('YOUR_ADMIN_EMAIL'));

commit;
