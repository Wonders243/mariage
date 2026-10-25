-- À exécuter dans Supabase > SQL Editor après avoir remplacé les occurrences
-- de YOUR_ADMIN_EMAIL par l’adresse du compte qui gérera le site.

create table if not exists public.wedding_site_content (
  id text primary key check (id = 'main'),
  content jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.wedding_site_content enable row level security;
revoke select on public.wedding_site_content from anon, public;
grant select on public.wedding_site_content to authenticated;
grant update on public.wedding_site_content to authenticated;

drop policy if exists "Wedding content is public" on public.wedding_site_content;
drop policy if exists "Only the site admin can read wedding content" on public.wedding_site_content;
create policy "Only the site admin can read wedding content"
  on public.wedding_site_content for select
  to authenticated
  using (id = 'main' and lower(coalesce(auth.jwt() ->> 'email', '')) = lower('YOUR_ADMIN_EMAIL'));

drop policy if exists "Only the site admin can update wedding content" on public.wedding_site_content;
create policy "Only the site admin can update wedding content"
  on public.wedding_site_content for update
  to authenticated
  using (id = 'main' and lower(coalesce(auth.jwt() ->> 'email', '')) = lower('YOUR_ADMIN_EMAIL'))
  with check (id = 'main' and lower(coalesce(auth.jwt() ->> 'email', '')) = lower('YOUR_ADMIN_EMAIL'));

insert into public.wedding_site_content (id, content)
values (
  'main',
  '{
    "nameOne": "Merveilles",
    "nameTwo": "Megan",
    "heroEyebrow": "On se marie !",
    "heroIntro": "On espère vous y retrouver !",
    "weddingDate": "2027-01-16",
    "countdownTitle": "On compte les jours",
    "heroImageUrl": "assets/demande-en-mariage.jpg",
    "heroImageAlt": "Merveilles et Megan lors de leur demande en mariage, sur une terrasse face aux montagnes",
    "heroCaption": "Le moment de la demande",
    "programmeTitle": "Les rendez-vous",
    "events": [
      {
        "time": "15 h 30",
        "title": "À la mairie d’Alès",
        "description": "La cérémonie civile.",
        "mapUrl": "https://www.google.com/maps/search/?api=1&query=Mairie+d%27Al%C3%A8s"
      },
      {
        "time": "20 minutes après la cérémonie",
        "title": "Photos au Parc du Bosquet",
        "description": "À Alès.",
        "mapUrl": "https://www.google.com/maps/search/?api=1&query=Parc+du+Bosquet+Al%C3%A8s"
      }
    ],
    "dressLabel": "Pour la tenue",
    "dressNote": "Une touche de vert ou de rouge nous ferait plaisir, si vous en avez envie.",
    "rsvpTitle": "Vous serez là ?",
    "rsvpMessage": "Pour nous aider à préparer cette journée, merci de répondre avant le",
    "rsvpDeadline": "2026-12-16",
    "galleryEyebrow": "En attendant janvier",
    "galleryTitle": "Quelques photos de nous",
    "galleryImages": [
      {
        "url": "assets/couple-variante.jpg",
        "alt": "Merveilles et Megan, un moment complice dans la nature",
        "caption": ""
      },
      {
        "url": "assets/couple-fond.png",
        "alt": "Merveilles et Megan souriants devant une cascade",
        "caption": ""
      }
    ]
  }'::jsonb
)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('wedding-photos', 'wedding-photos', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Wedding photos are public" on storage.objects;
drop policy if exists "Only the site admin can read wedding photos" on storage.objects;
create policy "Only the site admin can read wedding photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'wedding-photos'
    and lower(coalesce(auth.jwt() ->> 'email', '')) = lower('YOUR_ADMIN_EMAIL')
  );

drop policy if exists "Only the site admin can upload wedding photos" on storage.objects;
create policy "Only the site admin can upload wedding photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'wedding-photos'
    and lower(coalesce(auth.jwt() ->> 'email', '')) = lower('YOUR_ADMIN_EMAIL')
  );

drop policy if exists "Only the site admin can update wedding photos" on storage.objects;
create policy "Only the site admin can update wedding photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'wedding-photos'
    and lower(coalesce(auth.jwt() ->> 'email', '')) = lower('YOUR_ADMIN_EMAIL')
  )
  with check (
    bucket_id = 'wedding-photos'
    and lower(coalesce(auth.jwt() ->> 'email', '')) = lower('YOUR_ADMIN_EMAIL')
  );

drop policy if exists "Only the site admin can delete wedding photos" on storage.objects;
create policy "Only the site admin can delete wedding photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'wedding-photos'
    and lower(coalesce(auth.jwt() ->> 'email', '')) = lower('YOUR_ADMIN_EMAIL')
  );
