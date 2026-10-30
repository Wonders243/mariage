-- Protège le contenu du site et les photos déjà présents dans Supabase.
-- Remplace YOUR_ADMIN_EMAIL par l’adresse exacte du compte d’administration avant exécution.

alter table public.wedding_site_content enable row level security;
revoke select on public.wedding_site_content from anon, public;
grant select, update on public.wedding_site_content to authenticated;

drop policy if exists "Wedding content is public" on public.wedding_site_content;
drop policy if exists "Only the site admin can read wedding content" on public.wedding_site_content;
create policy "Only the site admin can read wedding content"
  on public.wedding_site_content for select
  to authenticated
  using (
    id = 'main'
    and lower(coalesce(auth.jwt() ->> 'email', '')) = lower('merveilleskatabisomwe@gmail.com')
  );

drop policy if exists "Only the site admin can update wedding content" on public.wedding_site_content;
create policy "Only the site admin can update wedding content"
  on public.wedding_site_content for update
  to authenticated
  using (
    id = 'main'
    and lower(coalesce(auth.jwt() ->> 'email', '')) = lower('merveilleskatabisomwe@gmail.com')
  )
  with check (
    id = 'main'
    and lower(coalesce(auth.jwt() ->> 'email', '')) = lower('merveilleskatabisomwe@gmail.com')
  );

update storage.buckets
set public = false
where id = 'wedding-photos';

drop policy if exists "Wedding photos are public" on storage.objects;
drop policy if exists "Only the site admin can read wedding photos" on storage.objects;
create policy "Only the site admin can read wedding photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'wedding-photos'
    and lower(coalesce(auth.jwt() ->> 'email', '')) = lower('merveilleskatabisomwe@gmail.com')
  );

-- Autorise l’administration à ajouter, remplacer et retirer les photos du site.
drop policy if exists "Only the site admin can upload wedding photos" on storage.objects;
create policy "Only the site admin can upload wedding photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'wedding-photos'
    and lower(coalesce(auth.jwt() ->> 'email', '')) = lower('merveilleskatabisomwe@gmail.com')
  );

drop policy if exists "Only the site admin can update wedding photos" on storage.objects;
create policy "Only the site admin can update wedding photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'wedding-photos'
    and lower(coalesce(auth.jwt() ->> 'email', '')) = lower('merveilleskatabisomwe@gmail.com')
  )
  with check (
    bucket_id = 'wedding-photos'
    and lower(coalesce(auth.jwt() ->> 'email', '')) = lower('merveilleskatabisomwe@gmail.com')
  );

drop policy if exists "Only the site admin can delete wedding photos" on storage.objects;
create policy "Only the site admin can delete wedding photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'wedding-photos'
    and lower(coalesce(auth.jwt() ->> 'email', '')) = lower('merveilleskatabisomwe@gmail.com')
  );
