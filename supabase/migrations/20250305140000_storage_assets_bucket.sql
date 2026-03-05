-- Bucket for carousel assets: carousels/{project}/{run_id}/slide_001.png etc.
-- Public bucket so URLs like .../storage/v1/object/assets/carousels/SNS_2026W09/.../slide_001.png work without signed URLs.
insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do update set public = true;

-- Allow uploads/overwrites: service role (n8n, backend) bypasses RLS; these policies allow authenticated app users.
create policy "Allow insert into assets bucket"
on storage.objects for insert to authenticated
with check (bucket_id = 'assets');

create policy "Allow update in assets bucket"
on storage.objects for update to authenticated
using (bucket_id = 'assets');

create policy "Allow delete in assets bucket"
on storage.objects for delete to authenticated
using (bucket_id = 'assets');

-- Public read is implied by bucket.public = true; no SELECT policy required for public URLs.
