-- Storage bucket for report photos. Public-read (a photo of an item carries
-- no owner PII by itself), owner-write.

insert into storage.buckets (id, name, public)
values ('report-photos', 'report-photos', true)
on conflict (id) do nothing;

create policy "report photos are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'report-photos');

create policy "authenticated users can upload report photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
