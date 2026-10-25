-- Prépare les invitations et les réponses privées.
-- Remplace YOUR_ADMIN_EMAIL par l’adresse exacte du compte admin avant exécution.

create table if not exists public.wedding_rsvp_invitations (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  invitation_label text not null,
  guests jsonb not null check (jsonb_typeof(guests) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wedding_rsvp_invitations enable row level security;
revoke all on table public.wedding_rsvp_invitations from public, anon, authenticated;
grant select, insert, update, delete on table public.wedding_rsvp_invitations to authenticated;
grant all on table public.wedding_rsvp_invitations to service_role;

drop policy if exists "Wedding admin manages invitations" on public.wedding_rsvp_invitations;
create policy "Wedding admin manages invitations"
  on public.wedding_rsvp_invitations
  for all
  to authenticated
  using (
    lower(coalesce(auth.jwt() ->> 'email', '')) = lower('YOUR_ADMIN_EMAIL')
  )
  with check (
    lower(coalesce(auth.jwt() ->> 'email', '')) = lower('YOUR_ADMIN_EMAIL')
  );

create table if not exists public.wedding_rsvp_messages (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.wedding_rsvp_invitations(id) on delete cascade,
  guest_id uuid not null,
  guest_name text not null,
  is_anonymous boolean not null default false,
  message text not null check (char_length(btrim(message)) between 3 and 700),
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invitation_id, guest_id)
);

alter table public.wedding_rsvp_messages
  add column if not exists is_anonymous boolean not null default false;

alter table public.wedding_rsvp_messages enable row level security;
revoke all on table public.wedding_rsvp_messages from public, anon, authenticated;
grant select, insert, update, delete on table public.wedding_rsvp_messages to authenticated;
grant all on table public.wedding_rsvp_messages to service_role;

drop policy if exists "Wedding admin moderates guest messages" on public.wedding_rsvp_messages;
create policy "Wedding admin moderates guest messages"
  on public.wedding_rsvp_messages
  for all
  to authenticated
  using (
    lower(coalesce(auth.jwt() ->> 'email', '')) = lower('YOUR_ADMIN_EMAIL')
  )
  with check (
    lower(coalesce(auth.jwt() ->> 'email', '')) = lower('YOUR_ADMIN_EMAIL')
  );

-- Retire les anciens champs Mariages.net qui ne sont plus utilisés.
update public.wedding_site_content
set content = content - 'rsvpUrl' - 'rsvpButtonLabel' - 'rsvpSteps',
    updated_at = now()
where id = 'main';

-- Limite les essais du formulaire public à 30 requêtes par adresse IP toutes les 15 minutes.
-- Seule la fonction Edge, qui détient la clé serveur, peut consulter cette table.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.wedding_rsvp_rate_limits (
  fingerprint text primary key check (fingerprint ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0
);
revoke all on table private.wedding_rsvp_rate_limits from public, anon, authenticated;
grant all on table private.wedding_rsvp_rate_limits to service_role;

create or replace function public.allow_wedding_rsvp_attempt(p_fingerprint text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt_count integer;
begin
  delete from private.wedding_rsvp_rate_limits
  where window_started_at < now() - interval '24 hours';

  insert into private.wedding_rsvp_rate_limits as current_limit (
    fingerprint, window_started_at, attempts
  )
  values (p_fingerprint, now(), 1)
  on conflict (fingerprint) do update
  set
    window_started_at = case
      when current_limit.window_started_at <= now() - interval '15 minutes' then now()
      else current_limit.window_started_at
    end,
    attempts = case
      when current_limit.window_started_at <= now() - interval '15 minutes' then 1
      else current_limit.attempts + 1
    end
  returning attempts into attempt_count;

  return attempt_count <= 30;
end;
$$;

revoke all on function public.allow_wedding_rsvp_attempt(text) from public, anon, authenticated;
grant execute on function public.allow_wedding_rsvp_attempt(text) to service_role;

