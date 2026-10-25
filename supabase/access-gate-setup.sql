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
    and lower(coalesce(auth.jwt() ->> 'email', '')) = lower('YOUR_ADMIN_EMAIL')
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
    and lower(coalesce(auth.jwt() ->> 'email', '')) = lower('YOUR_ADMIN_EMAIL')
  );
