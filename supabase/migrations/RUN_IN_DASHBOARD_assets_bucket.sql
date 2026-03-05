-- Run this once in Supabase Dashboard → SQL Editor (if you don't use "supabase db push").
-- Idempotent: safe to run again (bucket upserted, policies replaced).

-- 1. Create public bucket "assets" for carousel URLs
insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do update set public = true;

-- 2. Policies for uploads (service role bypasses RLS; these allow authenticated app users)
drop policy if exists "Allow insert into assets bucket" on storage.objects;
create policy "Allow insert into assets bucket"
on storage.objects for insert to authenticated
with check (bucket_id = 'assets');

drop policy if exists "Allow update in assets bucket" on storage.objects;
create policy "Allow update in assets bucket"
on storage.objects for update to authenticated
using (bucket_id = 'assets');

drop policy if exists "Allow delete in assets bucket" on storage.objects;
create policy "Allow delete in assets bucket"
on storage.objects for delete to authenticated
using (bucket_id = 'assets');

-- 3. Allow public read so asset URLs work in browser (preview/video in review console)
drop policy if exists "Allow public read assets bucket" on storage.objects;
create policy "Allow public read assets bucket"
on storage.objects for select to anon
using (bucket_id = 'assets');
